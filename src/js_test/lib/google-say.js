"use strict"; 

var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var urlParse  = require('url').parse; var googleTTS = require('google-tts-api');
var child = require('child_process');

function downloadFile (url, dest) {
  return new Promise(function (resolve, reject) {
    var info = urlParse(url);
    var httpClient = info.protocol === 'https:' ? https : http;
    var options = {
      host: info.host,
      path: info.path,
      headers: {
        'user-agent': 'WHAT_EVER'
      }
    };

    httpClient.get(options, function(res) {
      // check status code
      if (res.statusCode !== 200) {
        reject(new Error('request to ' + url + ' failed, status code = ' + res.statusCode + ' (' + res.statusMessage + ')'));
        return;
      }

      var file = fs.createWriteStream(dest);
      file.on('finish', function() {
        // close() is async, call resolve after close completes.
        file.close(resolve);
      });
      file.on('error', function (err) {
        // Delete the file async. (But we don't check the result)
        fs.unlink(dest);
        reject(err);
      });

      res.pipe(file);
    })
    .on('error', function(err) {
      reject(err);
    })
    .end();
  });
}

function playFile(file){
  return new Promise(function (resolve, reject) {
    let playMp3 = child.execFileSync('mpg123', [file]);
    if (playMp3){
      resolve(file);
    }else {
      reject("Could not play file");
    }
  });
};

function deleteFile(file){
  return new Promise(function (resolve, reject) {
    let removeMp3 = child.execFileSync('rm', [file]);
    if (removeMp3){
      resolve();
    }else {
      reject("Could not delete file");
    }
  });
};

function say(phrase, language='en-GB'){
  
  let dest = path.resolve(__dirname, 'say.mp3'); // file destination
  // start
  googleTTS(phrase, language)
  .then(function (url) {
    console.log(url); // https://translate.google.com/translate_tts?...
    console.log('Download to ' + dest + ' ...');
    return downloadFile(url, dest);
  })
  .then(function () {
    console.log('Download success');
    return playFile(dest);
  }).then(function() {
    console.log('Finished playing mp3File');
    return deleteFile(dest);
  })
  .catch(function (err) {
    console.error(err.stack);
  });
};
module.exports = {
  say: say
}
