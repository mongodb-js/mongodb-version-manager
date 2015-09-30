var debug = require('debug')('mvm:download');
var path = require('./path');
var fs = require('fs-extra');
var request = require('request');
var createCleanupCrew = require('./cleanup');
var tildify = require('tildify');
var ProgressBar = require('progress');

/* eslint no-sync:0 */
module.exports = function(pkg, fn) {
  var dest = path.artifact(pkg);
  var url = pkg.url;
  var cleanup = createCleanupCrew('remove incomplete artifact', fs.unlinkSync.bind(null, dest));

  fs.mkdirs(path.artifacts(), function(err) {
    if (err) {
      return fn(err);
    }

    fs.exists(dest, function(exists) {
      if (exists) {
        debug('already have artifact ' + dest);
        cleanup.clear();
        return fn();
      }

      debug('downloading %s to %s', url, tildify(dest));

      var out = fs.createWriteStream(dest);
      var onError = function(fn) {
        out.removeListener('readable', onFinish);
        fn();
      };

      onFinish = function(fn) {
        cleanup.clear();
        out.removeListener('readable', onError);
        fn(null, dest);
      };
      out.once('error', onError).once('finish', onFinish);
      var req = request(url);
      req.on('response', function(res) {
        var total = parseInt(res.headers['content-length'], 10);
        debug('total size %dMB', (total / 1024 / 1024).toFixed(2));

        if (!total) {
          return fn(new Error('No response.  Are you sure '
            + pkg.version + ' is the right version?'));
        }

        console.log();
        var bar = new ProgressBar('  Downloading MongoDB v'
          + pkg.version + ' [:bar] :percent :etasec', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: total
          });

        res.on('data', function(chunk) {
          bar.tick(chunk.length);
        });

        res.on('end', function() {
          console.log('\n');
        });
      });
      req.pipe(out);
      req.on('error', fn);
    });
  });
};
