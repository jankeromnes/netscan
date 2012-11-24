var ws = require('ws'),
    cp = require('child_process');


// WebSocket server

var sockets = [],
    server = new ws.Server({port: 1337});

server.on('connection', function(socket) {
  var client = sockets.push(socket) - 1;

  console.log('client', client, 'join');

  socket.on('message', function(message) {
    console.log('client', client, ':', message);
  });

  socket.on('close', function () {
    console.log('client', client, 'left');
    sockets.splice(client);
  });
});

function send(data) {
  //console.log('send', data);
  for (var i = 0 ; i < sockets.length ; i++ ) {
    sockets[i].send(JSON.stringify(data));
  }
};


// Network tools

// List interfaces
function interfaces(callback) {
  var map = {};
  cp.exec('ip a', function (err, data) {
    var lines = data.split('\n'), words = null, interface = null;
    while (lines.length > 0) {
      var line = lines.shift();
      if (words = line.match(/^\d+: (\w+):/)) {
        map[words[1]] = interface = {};
      } else if (words = line.match(/^\s+([a-z0-9\/]+)\s+([a-f0-9:.]+)/)) {
        interface[words[1].replace('link/', '')] = words[2];
      }
    }
    if (callback) callback(map);
  });
};


// TODO Collect network info with `netstat -rn`
function network() {
}


// Listen for packets on an inteface
function listen(interface) {
  var hosts = {}, tcpdump, words = null, leftover = '', packets = [];

  function parseDate(stamp) {
    var date = new Date();
    date.setHours(parseInt(stamp.slice(0,2)));
    date.setMinutes(parseInt(stamp.slice(3,5)));
    date.setSeconds(parseInt(stamp.slice(6,8)));
    date.setMilliseconds(parseInt(stamp.slice(9))/1000);
    return date;
  }

  function parseIP(string) {
    var match = string.match(/^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9a-f:]+)(\.[0-9]+)?:?$/);
    if (!match) {
      console.error('BAD IP ADDRESS:', string); return;
    }
    var host = {ip: match[1].replace(/[^0-9a-f]+$/, '')};
    if (match[2]) host.port = match[2].slice(1);
    return host;
  }

  function parse(line) {
    //console.log(line);
    words = line.split(' ');
    if (words[0].match(/^([0-9:]+)\.([0-9]+)$/)) {
      var packet = {};
      packet.date = +parseDate(words[0]);
      switch (words[1]) {
        case 'ARP,':
          packet.protocol = 'ARP';
          if (words[2] === 'Request') {
            packet.from = {ip: words[6].replace(',', '')};
            packet.to = {ip: words[4]};
          } else if (words[2] === 'Reply') {
            packet.from = {ip: words[3], ether: words[5].replace(',', '')}
          }
          break;
        case 'IP': case 'IP6':
          packet.protocol = words[5].toUpperCase();
          packet.from = parseIP(words[2]);
          packet.to = parseIP(words[4]);
          break;
        default:
          console.error('UNKNOWN PACKET:', words);
          return;
      }
      packet.size = parseInt(words[words.length - 1], 10);
      packets.push(packet);
    } else {
      console.error('UNEXPECTED LINE:\n', line);
    }
  };

  function start() {
    console.log('starting tcpdump');
    var tcpdump = cp.spawn('tcpdump', ['-nSq', '-i' + interface]);
    tcpdump.stdout.setEncoding('utf8'); tcpdump.stderr.setEncoding('utf8');

    tcpdump.stdout.on('data', function(data) {
      //console.log(data);
      var lines = data.split('\n');
      lines[0] = leftover + lines[0];
      leftover = lines.pop();
      lines.map(parse);
      send(packets);
      packets = [];
    });

    tcpdump.stderr.on('data', function(data) { /* console.error(data); */ });

    tcpdump.on('exit', function(code, signal) {
      console.log('tcpdump exit(' + code + ')');
      start();
    });
  };

  start();
};

listen('wlan0');
