exports.setup = function(mstream, program){
  const child = require('child_process');
  const fe = require('path');

  // Load in API enndpoints
  // TODO: Change the name of this file
  const mstreamReadPublicDB = require('../db-read/database-public-loki.js');
  mstreamReadPublicDB.setup(mstream, program);

  // Var that keeps track of DB scans going on
  var isScanning = false;



  ///////////////////////////
  // TODO: Should we have a API call that can kill any process associated with a user and reset their scan value to false?
  ///////////////////////////

  ///////////////////////////
  // TODO: We could use some kind of manager to make sure we don't spawn to many child processes
  // For now we spawn indiscriminately and let the CPU sort it out
  ///////////////////////////


  // Get db status
  mstream.get('/db/status', function(req, res){
    // Get number of files in DB
    mstreamReadPublicDB.getNumberOfFiles(req.user.vpaths, function(numOfFiles){
      res.json({
        totalFileCount: numOfFiles,
        dbType: 'default',
        locked: isScanning
      });
    });
  });


  // Scan library
  mstream.get('/db/recursive-scan', function(req,res){
    var scan = runScan();

    var statusCode = (scan.error === true) ? 555 : 200;
    res.status(statusCode).json({ status: scan.message });
  });




  function scanIt(scanPackage, callback){
    // Prepare JSON load for forked process
    var jsonLoad = {
       directory: scanPackage.directory,
       vpath: scanPackage.vpath,
       dbSettings: program.database_plugin,
       albumArtDir: program.albumArtDir
    }

    const forkedScan = child.fork(  fe.join(__dirname, 'database-default-manager.js'), [JSON.stringify(jsonLoad)], {silent: true});

    forkedScan.stdout.on('data', (data) => {
      // TODO: Move this to a interval
      mstreamReadPublicDB.loadDB();
      console.log(`stdout: ${data}`);
    });
    forkedScan.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
    });
    forkedScan.on('close', (code) => {
      isScanning = false;
      callback();
      console.log(`child process exited with code ${code}`);
    });

    return {error:false, message: 'Scan started'};
  }


  // Scan on startup
  function *bootScan(){
    // Loop through list of users
    for (let vpath in program.folders) {

      yield scanIt( {
        directory: program.folders[vpath].root,
        vpath: vpath
      }, function(){
        mstreamReadPublicDB.loadDB();
        bootScanGenerator.next();
      });
    }
  }


  var  bootScanGenerator
  function runScan(){
    // Check that scan is not already in progress
    if(isScanning === true){
      return {error:true, message: 'Scan in Progress'}; // Need to return a status
    }

    // Lock user
    isScanning= true;

    bootScanGenerator = bootScan();
    bootScanGenerator.next();

    return {error:false, message: 'Scan Started'};
  }

  runScan();
}
