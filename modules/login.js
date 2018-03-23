exports.setup = function(mstream, program, express){
  const jwt = require('jsonwebtoken');
  const crypto = require('crypto');

  // Convenience variable
  var Users = program.users;

  // Crypto Config
  var hashConfig = {
    // size of the generated hash
    hashBytes: 32,
    // larger salt means hashed passwords are more resistant to rainbow table, but
    // you get diminishing returns pretty fast
    saltBytes: 16,
    iterations: 15000,
    encoding   : 'base64'
  };

  // TODO: Need a way to store and use already hashed passwords

  // Loop through users and setup passwords
  for (let username in Users) {
    generateSaltedPassword(username, Users[username]["password"]);
  }


  function generateSaltedPassword(username, password){
    crypto.randomBytes(hashConfig.saltBytes, function(err, salt) {
      if (err) {
        console.log('USER SETUP ERROR!')
      }

      crypto.pbkdf2(password, salt, hashConfig.iterations, hashConfig.hashBytes, 'sha512', function(err, hash) {
        if (err) {
          console.log('USER SETUP ERROR!')
        }

        Users[username]['password'] = new Buffer(hash).toString('hex');
        Users[username]['salt'] = salt;
      });
    });
  }

  // Failed Login Attempt
  mstream.get('/login-failed', function (req, res) {
    // Wait before sending the response
    setTimeout((function() {
      res.status(599).json({error:'Try Again'})
    }), 800);
  });

  mstream.get('/access-denied', function (req, res) {
    res.status(598).json({error:'Access Denied'});
  });

  // Authenticate User
  mstream.post('/login', function(req, res) {
    if(!req.body.username || !req.body.password){
      return res.redirect('/login-failed');
    }

    let username = req.body.username;
    let password = req.body.password;

    // Check is user is in array
    if(typeof Users[username] === 'undefined') {
      // user does not exist
      return res.redirect('/login-failed');
    }

    // Check is password is correct
    crypto.pbkdf2(password, Users[username]['salt'], hashConfig.iterations, hashConfig.hashBytes, 'sha512', function(err, verifyHash) {
      // Make sure passwords match
      if(new Buffer(verifyHash).toString('hex') !==  Users[username]['password']){
        return res.redirect('/login-failed');
      }

      // return the information including token as JSON
      res.json({
        token: jwt.sign({username: username}, program.secret) // Make the token
      });
    });
  });

  // Middleware that checks for token
  mstream.use(function(req, res, next) {
    // check header or url parameters or post parameters for token
    var token = req.body.token || req.query.token || req.headers['x-access-token'];
    if (!token) {
      return res.redirect('/access-denied');
    }

    // verifies secret and checks exp
    jwt.verify(token, program.secret, function(err, decoded) {
      if (err) {
        return res.redirect('/access-denied');
      }

      // Check if share token
      // User may access those files and no others
      if(decoded.shareToken && decoded.shareToken === true){
        // We limit the endpoints to download and anythign in the allowedFiles array
        if(req.path !== '/download' && decoded.allowedFiles.indexOf(decodeURIComponent(req.path).slice(7)) === -1){
          return res.redirect('/access-denied');
        }
        req.allowedFiles = decoded.allowedFiles;
        next();
        return;
      }

      // Check for any hardcoded restrictions baked right into token
      if(decoded.restrictedFunctions && decoded.restrictedFunctions.indexOf(req.path) != -1){
        return res.redirect('/access-denied');
      }

      // Setup User variable for api endpoints to access
      req.user = Users[decoded.username];
      req.user.username = decoded.username;

      next();
    });
  });
}
