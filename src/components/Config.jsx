var seedRandom = require('seed-random');
var palettes = require('./color-palettes.json');
var createRandomRange = require('./Random-range.jsx');

module.exports = function (path, seed) {
  if (typeof seed === 'undefined') {
    seed = String(Math.floor(Math.random() * 1000000));
  }
  // console.log(path);
  console.log('Seed:', seed);

  var randomFunc = seedRandom(seed);
  var random = createRandomRange(randomFunc);

  var maps = [
    'nature1.jpg', 'snowflake.jpg',
    'map7.jpg', 'pentagram.jpg',
    'fractal2.jpg',
    'fractal1.jpg', 'eye.jpg', 'church2.jpg',
    'pat1.jpg'
  ].map(function (p) {
    return './public/canvas/' + p;
  });

  if (path == undefined) {
    var mapSrc = maps[Math.floor(random(maps.length))];
  } else {
    var mapSrc = path;
  }
  // console.log(mapSrc);

  return {
    // rendering options
    random: randomFunc,
    seedName: seed,
    pointilism: random(0, 0.1),
    noiseScalar: [ random(0.000001, 0.000001), random(0.0002, 0.004) ],
    globalAlpha: 0.5,
    startArea: random(0.0, 1.5),
    maxRadius: random(5, 100),
    lineStyle: random(1) > 0.5 ? 'round' : 'square',
    interval: random(0.001, 0.01),
    count: Math.floor(random(50, 2000)),
    steps: Math.floor(random(100, 1000)),
    endlessBrowser: true, // Whether to endlessly step in browser

    // background image that drives the algorithm
    debugLuma: false,
    backgroundScale: 1,
    backgorundFille: 'black',
    backgroundSrc: mapSrc,

    // browser/node options
    pixelRatio: 1,
    width: 1280 * 2,
    height: 720 * 2,
    palette: getPalette(),

    // node only options
    asVideoFrames: false,
    filename: 'render',
    outputDir: 'output'
  };

  function getPalette () {
    var paletteColors = palettes[Math.floor(random() * palettes.length)];
    return arrayShuffle(paletteColors);
  }

  function arrayShuffle (arr) {
    var rand;
    var tmp;
    var len = arr.length;
    var ret = arr.slice();

    while (len) {
      rand = Math.floor(random(1) * len--);
      tmp = ret[len];
      ret[len] = ret[rand];
      ret[rand] = tmp;
    }

    return ret;
  }
};
