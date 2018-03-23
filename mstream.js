exports.logit = function(msg){
  console.log(msg);
}

exports.addresses = {
  localhost: false,
  network: false,
  internet: false
}

exports.bootStatus = false;

exports.serveit = function (program, callback) {
  const express = require('express');
  const mstream = express();
  const fs = require('fs');  // File System
  const fe = require('path');
  const bodyParser = require('body-parser');

  var server;

  if(program.ssl && program.ssl.cert && program.ssl.key){
    try{
      // TODO: Verify files are real
      server = require('https').createServer({
        key: fs.readFileSync(program.ssl.key),
        cert: fs.readFileSync( program.ssl.cert)
      });
    }catch(error){
      console.log('FAILED TO CREATE HTTPS SERVER');
      error.code = 'BAD CERTS';
      throw error;
    }
  }else{
    server = require('http').createServer();
  }

  // Magic Middleware Things
  mstream.use(bodyParser.json()); // support json encoded bodies
  mstream.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

  // Setup WebApp
  if(program.userinterface){
    // Give access to public folder
    mstream.use( '/public',  express.static(fe.join(__dirname, program.userinterface) ));
    // Serve the webapp
    mstream.get('/', function (req, res) {
    	res.sendFile(  fe.join(program.userinterface, 'mstream.html'), { root: __dirname });
    });
  }
  // Setup Album Art
  if(!program.albumArtDir){
    program.albumArtDir = fe.join(__dirname, 'image-cache');
  }
  // Move to after login systm
  mstream.use( '/album-art',  express.static(program.albumArtDir ));

  // This is a convenience function. It gets the vPath from any url string
  program.getVPathInfo = function(path){
    return fe.join( program.musicDir, path);
  }

  // Setup Secret for JWT
  try{
    // IF user entered a filepath
    if(fs.statSync(program.secret).isFile()){
      program.secret = fs.readFileSync(program.secret, 'utf8');
    }
  }catch(error){
    if(program.secret){
      // just use secret as is
      program.secret = String(program.secret);
    }else{
      // If no secret was given, generate one
      require('crypto').randomBytes(48, function(err, buffer) {
        program.secret = buffer.toString('hex');
      });
    }
  }

  // Setup all folders with express static
  mstream.use( '/media/' + key + '/' , express.static(  program.musicDir  ));

  // Login functionality
  program.auth = false;
  if(program.users){
    require('./modules/login.js').setup(mstream, program, express);
    program.auth = true;
  }else{
    program.users = {
      "mstream-user":{
        username: "mstream-user",
        admin: true
      }
    }

    // Fill in the necessary middleware
    mstream.use(function(req, res, next) {
      req.user = program.users['mstream-user'];
      next();
    });
  }

  // Used to determine the user has a working login token
  mstream.get('/ping', (req, res) => {
    res.json({ success: true });
  });

  // Download Files Call
  require('./modules/download.js').setup(mstream, program);
  // File Explorer API Call
  require('./modules/file-explorer.js').setup(mstream, program);
  // Load database plugin system
  require('./modules/db-management/database-master.js').setup(mstream, program);


  // Start the server!
  // TODO: Check if port is in use before firing up server
  server.on('request', mstream);
  server.listen(program.port, function () {
    exports.bootStatus = true;
    let protocol = program.ssl && program.ssl.cert && program.ssl.key ? 'https' : 'http';
    exports.addresses.local = protocol + '://localhost:' + program.port;
    exports.logit('Access mStream locally: ' + exports.addresses.local);

    // Handle Port Forwarding
    if(program.tunnel){
      try{
        require('./modules/auto-port-forwarding.js').setup(program, function(status){
          if(status === true){
            require('public-ip').v4().then(ip => {
              // console.log('Access mStream on the internet: '+protocol+'://' + ip + ':' + program.port);
              exports.addresses.internet = protocol + '://' + ip + ':' + program.port;
              exports.logit('Access mStream on your local network:the internet: ' + exports.addresses.internet);
            });
          }else{
            console.log('Port Forwarding Failed');
            exports.logit('Port Forwarding Failed.  The server is runnig but you will have to configure your own port forwarding');
          }
        });
      }catch(err){
        console.log('Port Forwarding Failed');
        exports.logit('Port Forwarding Failed.  The server is runnig but you will have to configure your own port forwarding');
      }
    }
  });

}
