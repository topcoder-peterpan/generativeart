(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

// Mark output/export as enabled for the client API scripts.
window['canvas-sketch-cli'] = window['canvas-sketch-cli'] || {};
window['canvas-sketch-cli'].output = true;

},{}],2:[function(require,module,exports){
"use strict";

const NAMESPACE = 'canvas-sketch-cli'; // Grab the CLI namespace

window[NAMESPACE] = window[NAMESPACE] || {};

if (!window[NAMESPACE].initialized) {
  initialize();
}

function initialize() {
  // Awaiting enable/disable event
  window[NAMESPACE].liveReloadEnabled = undefined;
  window[NAMESPACE].initialized = true;
  const defaultPostOptions = {
    method: 'POST',
    cache: 'no-cache',
    credentials: 'same-origin'
  }; // File saving utility

  window[NAMESPACE].saveBlob = (blob, opts) => {
    opts = opts || {};
    const form = new window.FormData();
    form.append('file', blob, opts.filename);
    return window.fetch('/canvas-sketch-cli/saveBlob', Object.assign({}, defaultPostOptions, {
      body: form
    })).then(res => {
      if (res.status === 200) {
        return res.json();
      } else {
        return res.text().then(text => {
          throw new Error(text);
        });
      }
    }).catch(err => {
      // Some issue, just bail out and return nil hash
      console.warn(`There was a problem exporting ${opts.filename}`);
      console.error(err);
      return undefined;
    });
  };

  const stream = (url, opts) => {
    opts = opts || {};
    return window.fetch(url, Object.assign({}, defaultPostOptions, {
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        save: opts.save,
        encoding: opts.encoding,
        timeStamp: opts.timeStamp,
        fps: opts.fps,
        filename: opts.filename
      })
    })).then(res => {
      if (res.status === 200) {
        return res.json();
      } else {
        return res.text().then(text => {
          throw new Error(text);
        });
      }
    }).catch(err => {
      // Some issue, just bail out and return nil hash
      console.warn(`There was a problem starting the stream export`);
      console.error(err);
      return undefined;
    });
  }; // File streaming utility


  window[NAMESPACE].streamStart = opts => {
    return stream('/canvas-sketch-cli/stream-start', opts);
  };

  window[NAMESPACE].streamEnd = opts => {
    return stream('/canvas-sketch-cli/stream-end', opts);
  }; // git commit utility


  window[NAMESPACE].commit = () => {
    return window.fetch('/canvas-sketch-cli/commit', defaultPostOptions).then(resp => resp.json()).then(result => {
      if (result.error) {
        if (result.error.toLowerCase().includes('not a git repository')) {
          console.warn(`Warning: ${result.error}`);
          return null;
        } else {
          throw new Error(result.error);
        }
      } // Notify user of changes


      console.log(result.changed ? `[git] ${result.hash} Committed changes` : `[git] ${result.hash} Nothing changed`);
      return result.hash;
    }).catch(err => {
      // Some issue, just bail out and return nil hash
      console.warn('Could not commit changes and fetch hash');
      console.error(err);
      return undefined;
    });
  };

  if ('budo-livereload' in window) {
    const client = window['budo-livereload'];
    client.listen(data => {
      if (data.event === 'hot-reload') {
        setupLiveReload(data.enabled);
      }
    }); // On first load, check to see if we should setup live reload or not

    if (window[NAMESPACE].hot) {
      setupLiveReload(true);
    } else {
      setupLiveReload(false);
    }
  }
}

function setupLiveReload(isEnabled) {
  const previousState = window[NAMESPACE].liveReloadEnabled;

  if (typeof previousState !== 'undefined' && isEnabled !== previousState) {
    // We need to reload the page to ensure the new sketch function is
    // named for hot reloading, and/or cleaned up after hot reloading is disabled
    window.location.reload(true);
    return;
  }

  if (isEnabled === window[NAMESPACE].liveReloadEnabled) {
    // No change in state
    return;
  } // Mark new state


  window[NAMESPACE].liveReloadEnabled = isEnabled;

  if (isEnabled) {
    if ('budo-livereload' in window) {
      console.log(`%c[canvas-sketch-cli]%c ✨ Hot Reload Enabled`, 'color: #8e8e8e;', 'color: initial;');
      const client = window['budo-livereload'];
      client.listen(onClientData);
    }
  }
}

function onClientData(data) {
  const client = window['budo-livereload'];
  if (!client) return;

  if (data.event === 'eval') {
    if (!data.error) {
      client.clearError();
    }

    try {
      eval(data.code);
      if (!data.error) console.log(`%c[canvas-sketch-cli]%c ✨ Hot Reloaded`, 'color: #8e8e8e;', 'color: initial;');
    } catch (err) {
      console.error(`%c[canvas-sketch-cli]%c 🚨 Hot Reload error`, 'color: #8e8e8e;', 'color: initial;');
      client.showError(err.toString()); // This will also load up the problematic script so that stack traces with
      // source maps is visible

      const scriptElement = document.createElement('script');

      scriptElement.onload = () => {
        document.body.removeChild(scriptElement);
      };

      scriptElement.src = data.src;
      document.body.appendChild(scriptElement);
    }
  }
}

},{}],3:[function(require,module,exports){
"use strict";

/**
 * A Canvas2D example of a procedurally animated 'scribble'.
 * @author Matt DesLauriers (@mattdesl)
 */
const canvasSketch = require('canvas-sketch');

const Random = require('canvas-sketch-util/random');

const {
  clamp,
  linspace
} = require('canvas-sketch-util/math'); // Setup our sketch & export parameters


const settings = {
  dimensions: [1024, 1024],
  animate: true,
  fps: 25,
  duration: 20,
  scaleToView: true,
  playbackRate: 'throttle'
};

const sketch = ({
  context,
  width,
  height,
  render
}) => {
  // Parametric equation for a 3D torus
  const torus = (a, c, u, v, out = []) => {
    out[0] = (c + a * Math.cos(v)) * Math.cos(u);
    out[1] = (c + a * Math.cos(v)) * Math.sin(u);
    out[2] = a * Math.sin(v);
    return out;
  }; // Generate a slice of the curve at theta


  const generate = theta => {
    // Size of resulting curve
    const amplitude = 0.7; // Higher frequency leads to more chaotic curves

    const freq = 2; // Use a high number to get really fine line

    const resolution = 5000; // Size of parametric torus

    const torusRadius = 0.25;
    const torusInnerRadius = 1.5; // How fast to walk around the torus while drawing

    const rotation = theta * 5; // How much of the curve to draw at once (0..1)

    const sliceSize = 0.15; // Make the loop last just a bit longer
    // so that the curve fully disappears into the void

    const tailingDuration = 1.2; // Create the full curve
    // Note: This is a bit inefficient! We could just compute only the slice we want.

    const array = linspace(resolution, true).map(t => {
      const angle = Math.PI * 2 * t; // Get point along torus

      let point = torus(torusRadius, torusInnerRadius, angle, rotation);
      let [x, y, z] = point; // Apply noise frequency to coordinates

      x *= freq;
      y *= freq;
      z *= freq; // Compute noise coordinates

      return [amplitude * Random.noise4D(x, y, z, -1), amplitude * Random.noise4D(x, y, z, 1)];
    }); // Get just a slice of the curve

    const drawLength = Math.floor(resolution * sliceSize);
    const draw = theta * resolution * tailingDuration - drawLength / 2;
    const start = clamp(Math.floor(draw - drawLength / 2), 0, resolution);
    const end = clamp(Math.floor(draw + drawLength / 2), 0, resolution);
    return array.slice(start, end);
  }; // Initial value for slowly rotation hue


  let hueStart; // Gets new random noise & hue

  const randomize = () => {
    // Reset our random noise function to a new seed
    Random.setSeed(Random.getRandomSeed()); // Choose a new starting hue

    hueStart = Random.value(); // Log the seed for later reproducibility

    console.log('Seed:', Random.getSeed());
  };

  return {
    render: ({
      context,
      width,
      height,
      playhead
    }) => {
      // Clear the background with nearly black
      context.fillStyle = 'hsl(0, 0%, 5%)';
      context.fillRect(0, 0, width, height);
      context.save(); // First we translate all the -1..1 points into 0..scale range

      const scale = width / 2;
      context.translate(width / 2, height / 2);
      context.scale(scale, scale); // Create a HSL from the loop playhead

      const hue = (playhead + hueStart) % 1;
      const sat = 0.75;
      const light = 0.5;
      const hsl = [Math.floor(hue * 360), `${Math.floor(100 * sat)}%`, `${Math.floor(100 * light)}%`].join(', ');
      const stroke = `hsl(${hsl})`;
      const line = generate(playhead);
      context.lineWidth = 6 / scale;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      line.forEach(point => {
        context.lineTo(point[0], point[1]);
      });
      context.strokeStyle = stroke;
      context.stroke();
      context.restore();
    },
    begin: () => {
      // On loop start, re-compute the noise tables so we get a new
      // set of random values on the next loop
      randomize();
    }
  };
};

canvasSketch(sketch, settings);

},{"canvas-sketch":7,"canvas-sketch-util/math":5,"canvas-sketch-util/random":6}],4:[function(require,module,exports){
module.exports = wrap;
function wrap (value, from, to) {
  if (typeof from !== 'number' || typeof to !== 'number') {
    throw new TypeError('Must specify "to" and "from" arguments as numbers');
  }
  // algorithm from http://stackoverflow.com/a/5852628/599884
  if (from > to) {
    var t = from;
    from = to;
    to = t;
  }
  var cycle = to - from;
  if (cycle === 0) {
    return to;
  }
  return value - cycle * Math.floor((value - from) / cycle);
}

},{}],5:[function(require,module,exports){
var defined = require('defined');
var wrap = require('./lib/wrap');
var EPSILON = Number.EPSILON;

function clamp (value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value);
}

function clamp01 (v) {
  return clamp(v, 0, 1);
}

function lerp (min, max, t) {
  return min * (1 - t) + max * t;
}

function inverseLerp (min, max, t) {
  if (Math.abs(min - max) < EPSILON) return 0;
  else return (t - min) / (max - min);
}

function smoothstep (min, max, t) {
  var x = clamp(inverseLerp(min, max, t), 0, 1);
  return x * x * (3 - 2 * x);
}

function toFinite (n, defaultValue) {
  defaultValue = defined(defaultValue, 0);
  return typeof n === 'number' && isFinite(n) ? n : defaultValue;
}

function expandVector (dims) {
  if (typeof dims !== 'number') throw new TypeError('Expected dims argument');
  return function (p, defaultValue) {
    defaultValue = defined(defaultValue, 0);
    var scalar;
    if (p == null) {
      // No vector, create a default one
      scalar = defaultValue;
    } else if (typeof p === 'number' && isFinite(p)) {
      // Expand single channel to multiple vector
      scalar = p;
    }

    var out = [];
    var i;
    if (scalar == null) {
      for (i = 0; i < dims; i++) {
        out[i] = toFinite(p[i], defaultValue);
      }
    } else {
      for (i = 0; i < dims; i++) {
        out[i] = scalar;
      }
    }
    return out;
  };
}

function lerpArray (min, max, t, out) {
  out = out || [];
  if (min.length !== max.length) {
    throw new TypeError('min and max array are expected to have the same length');
  }
  for (var i = 0; i < min.length; i++) {
    out[i] = lerp(min[i], max[i], t);
  }
  return out;
}

function newArray (n, initialValue) {
  n = defined(n, 0);
  if (typeof n !== 'number') throw new TypeError('Expected n argument to be a number');
  var out = [];
  for (var i = 0; i < n; i++) out.push(initialValue);
  return out;
}

function linspace (n, opts) {
  n = defined(n, 0);
  if (typeof n !== 'number') throw new TypeError('Expected n argument to be a number');
  opts = opts || {};
  if (typeof opts === 'boolean') {
    opts = { endpoint: true };
  }
  var offset = defined(opts.offset, 0);
  if (opts.endpoint) {
    return newArray(n).map(function (_, i) {
      return n <= 1 ? 0 : ((i + offset) / (n - 1));
    });
  } else {
    return newArray(n).map(function (_, i) {
      return (i + offset) / n;
    });
  }
}

function lerpFrames (values, t, out) {
  t = clamp(t, 0, 1);

  var len = values.length - 1;
  var whole = t * len;
  var frame = Math.floor(whole);
  var fract = whole - frame;

  var nextFrame = Math.min(frame + 1, len);
  var a = values[frame % values.length];
  var b = values[nextFrame % values.length];
  if (typeof a === 'number' && typeof b === 'number') {
    return lerp(a, b, fract);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    return lerpArray(a, b, fract, out);
  } else {
    throw new TypeError('Mismatch in value type of two array elements: ' + frame + ' and ' + nextFrame);
  }
}

function mod (a, b) {
  return ((a % b) + b) % b;
}

function degToRad (n) {
  return n * Math.PI / 180;
}

function radToDeg (n) {
  return n * 180 / Math.PI;
}

function fract (n) {
  return n - Math.floor(n);
}

function sign (n) {
  if (n > 0) return 1;
  else if (n < 0) return -1;
  else return 0;
}

// Specific function from Unity / ofMath, not sure its needed?
// function lerpWrap (a, b, t, min, max) {
//   return wrap(a + wrap(b - a, min, max) * t, min, max)
// }

function pingPong (t, length) {
  t = mod(t, length * 2);
  return length - Math.abs(t - length);
}

function damp (a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

function dampArray (a, b, lambda, dt, out) {
  out = out || [];
  for (var i = 0; i < a.length; i++) {
    out[i] = damp(a[i], b[i], lambda, dt);
  }
  return out;
}

function mapRange (value, inputMin, inputMax, outputMin, outputMax, clamp) {
  // Reference:
  // https://openframeworks.cc/documentation/math/ofMath/
  if (Math.abs(inputMin - inputMax) < EPSILON) {
    return outputMin;
  } else {
    var outVal = ((value - inputMin) / (inputMax - inputMin) * (outputMax - outputMin) + outputMin);
    if (clamp) {
      if (outputMax < outputMin) {
        if (outVal < outputMax) outVal = outputMax;
        else if (outVal > outputMin) outVal = outputMin;
      } else {
        if (outVal > outputMax) outVal = outputMax;
        else if (outVal < outputMin) outVal = outputMin;
      }
    }
    return outVal;
  }
}

module.exports = {
  mod: mod,
  fract: fract,
  sign: sign,
  degToRad: degToRad,
  radToDeg: radToDeg,
  wrap: wrap,
  pingPong: pingPong,
  linspace: linspace,
  lerp: lerp,
  lerpArray: lerpArray,
  inverseLerp: inverseLerp,
  lerpFrames: lerpFrames,
  clamp: clamp,
  clamp01: clamp01,
  smoothstep: smoothstep,
  damp: damp,
  dampArray: dampArray,
  mapRange: mapRange,
  expand2D: expandVector(2),
  expand3D: expandVector(3),
  expand4D: expandVector(4)
};

},{"./lib/wrap":4,"defined":8}],6:[function(require,module,exports){
var seedRandom = require('seed-random');
var SimplexNoise = require('simplex-noise');
var defined = require('defined');

function createRandom (defaultSeed) {
  defaultSeed = defined(defaultSeed, null);
  var defaultRandom = Math.random;
  var currentSeed;
  var currentRandom;
  var noiseGenerator;
  var _nextGaussian = null;
  var _hasNextGaussian = false;

  setSeed(defaultSeed);

  return {
    value: value,
    createRandom: function (defaultSeed) {
      return createRandom(defaultSeed);
    },
    setSeed: setSeed,
    getSeed: getSeed,
    getRandomSeed: getRandomSeed,
    valueNonZero: valueNonZero,
    permuteNoise: permuteNoise,
    noise1D: noise1D,
    noise2D: noise2D,
    noise3D: noise3D,
    noise4D: noise4D,
    sign: sign,
    boolean: boolean,
    chance: chance,
    range: range,
    rangeFloor: rangeFloor,
    pick: pick,
    shuffle: shuffle,
    onCircle: onCircle,
    insideCircle: insideCircle,
    onSphere: onSphere,
    insideSphere: insideSphere,
    quaternion: quaternion,
    weighted: weighted,
    weightedSet: weightedSet,
    weightedSetIndex: weightedSetIndex,
    gaussian: gaussian
  };

  function setSeed (seed, opt) {
    if (typeof seed === 'number' || typeof seed === 'string') {
      currentSeed = seed;
      currentRandom = seedRandom(currentSeed, opt);
    } else {
      currentSeed = undefined;
      currentRandom = defaultRandom;
    }
    noiseGenerator = createNoise();
    _nextGaussian = null;
    _hasNextGaussian = false;
  }

  function value () {
    return currentRandom();
  }

  function valueNonZero () {
    var u = 0;
    while (u === 0) u = value();
    return u;
  }

  function getSeed () {
    return currentSeed;
  }

  function getRandomSeed () {
    var seed = String(Math.floor(Math.random() * 1000000));
    return seed;
  }

  function createNoise () {
    return new SimplexNoise(currentRandom);
  }

  function permuteNoise () {
    noiseGenerator = createNoise();
  }

  function noise1D (x, frequency, amplitude) {
    if (!isFinite(x)) throw new TypeError('x component for noise() must be finite');
    frequency = defined(frequency, 1);
    amplitude = defined(amplitude, 1);
    return amplitude * noiseGenerator.noise2D(x * frequency, 0);
  }

  function noise2D (x, y, frequency, amplitude) {
    if (!isFinite(x)) throw new TypeError('x component for noise() must be finite');
    if (!isFinite(y)) throw new TypeError('y component for noise() must be finite');
    frequency = defined(frequency, 1);
    amplitude = defined(amplitude, 1);
    return amplitude * noiseGenerator.noise2D(x * frequency, y * frequency);
  }

  function noise3D (x, y, z, frequency, amplitude) {
    if (!isFinite(x)) throw new TypeError('x component for noise() must be finite');
    if (!isFinite(y)) throw new TypeError('y component for noise() must be finite');
    if (!isFinite(z)) throw new TypeError('z component for noise() must be finite');
    frequency = defined(frequency, 1);
    amplitude = defined(amplitude, 1);
    return amplitude * noiseGenerator.noise3D(
      x * frequency,
      y * frequency,
      z * frequency
    );
  }

  function noise4D (x, y, z, w, frequency, amplitude) {
    if (!isFinite(x)) throw new TypeError('x component for noise() must be finite');
    if (!isFinite(y)) throw new TypeError('y component for noise() must be finite');
    if (!isFinite(z)) throw new TypeError('z component for noise() must be finite');
    if (!isFinite(w)) throw new TypeError('w component for noise() must be finite');
    frequency = defined(frequency, 1);
    amplitude = defined(amplitude, 1);
    return amplitude * noiseGenerator.noise4D(
      x * frequency,
      y * frequency,
      z * frequency,
      w * frequency
    );
  }

  function sign () {
    return boolean() ? 1 : -1;
  }

  function boolean () {
    return value() > 0.5;
  }

  function chance (n) {
    n = defined(n, 0.5);
    if (typeof n !== 'number') throw new TypeError('expected n to be a number');
    return value() < n;
  }

  function range (min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }

    if (typeof min !== 'number' || typeof max !== 'number') {
      throw new TypeError('Expected all arguments to be numbers');
    }

    return value() * (max - min) + min;
  }

  function rangeFloor (min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }

    if (typeof min !== 'number' || typeof max !== 'number') {
      throw new TypeError('Expected all arguments to be numbers');
    }

    return Math.floor(range(min, max));
  }

  function pick (array) {
    if (array.length === 0) return undefined;
    return array[rangeFloor(0, array.length)];
  }

  function shuffle (arr) {
    if (!Array.isArray(arr)) {
      throw new TypeError('Expected Array, got ' + typeof arr);
    }

    var rand;
    var tmp;
    var len = arr.length;
    var ret = arr.slice();
    while (len) {
      rand = Math.floor(value() * len--);
      tmp = ret[len];
      ret[len] = ret[rand];
      ret[rand] = tmp;
    }
    return ret;
  }

  function onCircle (radius, out) {
    radius = defined(radius, 1);
    out = out || [];
    var theta = value() * 2.0 * Math.PI;
    out[0] = radius * Math.cos(theta);
    out[1] = radius * Math.sin(theta);
    return out;
  }

  function insideCircle (radius, out) {
    radius = defined(radius, 1);
    out = out || [];
    onCircle(1, out);
    var r = radius * Math.sqrt(value());
    out[0] *= r;
    out[1] *= r;
    return out;
  }

  function onSphere (radius, out) {
    radius = defined(radius, 1);
    out = out || [];
    var u = value() * Math.PI * 2;
    var v = value() * 2 - 1;
    var phi = u;
    var theta = Math.acos(v);
    out[0] = radius * Math.sin(theta) * Math.cos(phi);
    out[1] = radius * Math.sin(theta) * Math.sin(phi);
    out[2] = radius * Math.cos(theta);
    return out;
  }

  function insideSphere (radius, out) {
    radius = defined(radius, 1);
    out = out || [];
    var u = value() * Math.PI * 2;
    var v = value() * 2 - 1;
    var k = value();

    var phi = u;
    var theta = Math.acos(v);
    var r = radius * Math.cbrt(k);
    out[0] = r * Math.sin(theta) * Math.cos(phi);
    out[1] = r * Math.sin(theta) * Math.sin(phi);
    out[2] = r * Math.cos(theta);
    return out;
  }

  function quaternion (out) {
    out = out || [];
    var u1 = value();
    var u2 = value();
    var u3 = value();

    var sq1 = Math.sqrt(1 - u1);
    var sq2 = Math.sqrt(u1);

    var theta1 = Math.PI * 2 * u2;
    var theta2 = Math.PI * 2 * u3;

    var x = Math.sin(theta1) * sq1;
    var y = Math.cos(theta1) * sq1;
    var z = Math.sin(theta2) * sq2;
    var w = Math.cos(theta2) * sq2;
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
  }

  function weightedSet (set) {
    set = set || [];
    if (set.length === 0) return null;
    return set[weightedSetIndex(set)].value;
  }

  function weightedSetIndex (set) {
    set = set || [];
    if (set.length === 0) return -1;
    return weighted(set.map(function (s) {
      return s.weight;
    }));
  }

  function weighted (weights) {
    weights = weights || [];
    if (weights.length === 0) return -1;
    var totalWeight = 0;
    var i;

    for (i = 0; i < weights.length; i++) {
      totalWeight += weights[i];
    }

    if (totalWeight <= 0) throw new Error('Weights must sum to > 0');

    var random = value() * totalWeight;
    for (i = 0; i < weights.length; i++) {
      if (random < weights[i]) {
        return i;
      }
      random -= weights[i];
    }
    return 0;
  }

  function gaussian (mean, standardDerivation) {
    mean = defined(mean, 0);
    standardDerivation = defined(standardDerivation, 1);

    // https://github.com/openjdk-mirror/jdk7u-jdk/blob/f4d80957e89a19a29bb9f9807d2a28351ed7f7df/src/share/classes/java/util/Random.java#L496
    if (_hasNextGaussian) {
      _hasNextGaussian = false;
      var result = _nextGaussian;
      _nextGaussian = null;
      return mean + standardDerivation * result;
    } else {
      var v1 = 0;
      var v2 = 0;
      var s = 0;
      do {
        v1 = value() * 2 - 1; // between -1 and 1
        v2 = value() * 2 - 1; // between -1 and 1
        s = v1 * v1 + v2 * v2;
      } while (s >= 1 || s === 0);
      var multiplier = Math.sqrt(-2 * Math.log(s) / s);
      _nextGaussian = (v2 * multiplier);
      _hasNextGaussian = true;
      return mean + standardDerivation * (v1 * multiplier);
    }
  }
}

module.exports = createRandom();

},{"defined":8,"seed-random":9,"simplex-noise":10}],7:[function(require,module,exports){
(function (global){(function (){
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.canvasSketch = factory());
}(this, (function () {

	/*
	object-assign
	(c) Sindre Sorhus
	@license MIT
	*/
	/* eslint-disable no-unused-vars */
	var getOwnPropertySymbols = Object.getOwnPropertySymbols;
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	var propIsEnumerable = Object.prototype.propertyIsEnumerable;

	function toObject(val) {
		if (val === null || val === undefined) {
			throw new TypeError('Object.assign cannot be called with null or undefined');
		}

		return Object(val);
	}

	function shouldUseNative() {
		try {
			if (!Object.assign) {
				return false;
			}

			// Detect buggy property enumeration order in older V8 versions.

			// https://bugs.chromium.org/p/v8/issues/detail?id=4118
			var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
			test1[5] = 'de';
			if (Object.getOwnPropertyNames(test1)[0] === '5') {
				return false;
			}

			// https://bugs.chromium.org/p/v8/issues/detail?id=3056
			var test2 = {};
			for (var i = 0; i < 10; i++) {
				test2['_' + String.fromCharCode(i)] = i;
			}
			var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
				return test2[n];
			});
			if (order2.join('') !== '0123456789') {
				return false;
			}

			// https://bugs.chromium.org/p/v8/issues/detail?id=3056
			var test3 = {};
			'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
				test3[letter] = letter;
			});
			if (Object.keys(Object.assign({}, test3)).join('') !==
					'abcdefghijklmnopqrst') {
				return false;
			}

			return true;
		} catch (err) {
			// We don't expect any of the above to throw, but better to be safe.
			return false;
		}
	}

	var objectAssign = shouldUseNative() ? Object.assign : function (target, source) {
		var from;
		var to = toObject(target);
		var symbols;

		for (var s = 1; s < arguments.length; s++) {
			from = Object(arguments[s]);

			for (var key in from) {
				if (hasOwnProperty.call(from, key)) {
					to[key] = from[key];
				}
			}

			if (getOwnPropertySymbols) {
				symbols = getOwnPropertySymbols(from);
				for (var i = 0; i < symbols.length; i++) {
					if (propIsEnumerable.call(from, symbols[i])) {
						to[symbols[i]] = from[symbols[i]];
					}
				}
			}
		}

		return to;
	};

	var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var browser =
	  commonjsGlobal.performance &&
	  commonjsGlobal.performance.now ? function now() {
	    return performance.now()
	  } : Date.now || function now() {
	    return +new Date
	  };

	var isPromise_1 = isPromise;

	function isPromise(obj) {
	  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
	}

	var isDom = isNode;

	function isNode (val) {
	  return (!val || typeof val !== 'object')
	    ? false
	    : (typeof window === 'object' && typeof window.Node === 'object')
	      ? (val instanceof window.Node)
	      : (typeof val.nodeType === 'number') &&
	        (typeof val.nodeName === 'string')
	}

	function getClientAPI() {
	    return typeof window !== 'undefined' && window['canvas-sketch-cli'];
	}

	function defined() {
	    var arguments$1 = arguments;

	    for (var i = 0;i < arguments.length; i++) {
	        if (arguments$1[i] != null) {
	            return arguments$1[i];
	        }
	    }
	    return undefined;
	}

	function isBrowser() {
	    return typeof document !== 'undefined';
	}

	function isWebGLContext(ctx) {
	    return typeof ctx.clear === 'function' && typeof ctx.clearColor === 'function' && typeof ctx.bufferData === 'function';
	}

	function isCanvas(element) {
	    return isDom(element) && /canvas/i.test(element.nodeName) && typeof element.getContext === 'function';
	}

	var keys = createCommonjsModule(function (module, exports) {
	exports = module.exports = typeof Object.keys === 'function'
	  ? Object.keys : shim;

	exports.shim = shim;
	function shim (obj) {
	  var keys = [];
	  for (var key in obj) keys.push(key);
	  return keys;
	}
	});
	var keys_1 = keys.shim;

	var is_arguments = createCommonjsModule(function (module, exports) {
	var supportsArgumentsClass = (function(){
	  return Object.prototype.toString.call(arguments)
	})() == '[object Arguments]';

	exports = module.exports = supportsArgumentsClass ? supported : unsupported;

	exports.supported = supported;
	function supported(object) {
	  return Object.prototype.toString.call(object) == '[object Arguments]';
	}
	exports.unsupported = unsupported;
	function unsupported(object){
	  return object &&
	    typeof object == 'object' &&
	    typeof object.length == 'number' &&
	    Object.prototype.hasOwnProperty.call(object, 'callee') &&
	    !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
	    false;
	}});
	var is_arguments_1 = is_arguments.supported;
	var is_arguments_2 = is_arguments.unsupported;

	var deepEqual_1 = createCommonjsModule(function (module) {
	var pSlice = Array.prototype.slice;



	var deepEqual = module.exports = function (actual, expected, opts) {
	  if (!opts) opts = {};
	  // 7.1. All identical values are equivalent, as determined by ===.
	  if (actual === expected) {
	    return true;

	  } else if (actual instanceof Date && expected instanceof Date) {
	    return actual.getTime() === expected.getTime();

	  // 7.3. Other pairs that do not both pass typeof value == 'object',
	  // equivalence is determined by ==.
	  } else if (!actual || !expected || typeof actual != 'object' && typeof expected != 'object') {
	    return opts.strict ? actual === expected : actual == expected;

	  // 7.4. For all other Object pairs, including Array objects, equivalence is
	  // determined by having the same number of owned properties (as verified
	  // with Object.prototype.hasOwnProperty.call), the same set of keys
	  // (although not necessarily the same order), equivalent values for every
	  // corresponding key, and an identical 'prototype' property. Note: this
	  // accounts for both named and indexed properties on Arrays.
	  } else {
	    return objEquiv(actual, expected, opts);
	  }
	};

	function isUndefinedOrNull(value) {
	  return value === null || value === undefined;
	}

	function isBuffer (x) {
	  if (!x || typeof x !== 'object' || typeof x.length !== 'number') return false;
	  if (typeof x.copy !== 'function' || typeof x.slice !== 'function') {
	    return false;
	  }
	  if (x.length > 0 && typeof x[0] !== 'number') return false;
	  return true;
	}

	function objEquiv(a, b, opts) {
	  var i, key;
	  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
	    return false;
	  // an identical 'prototype' property.
	  if (a.prototype !== b.prototype) return false;
	  //~~~I've managed to break Object.keys through screwy arguments passing.
	  //   Converting to array solves the problem.
	  if (is_arguments(a)) {
	    if (!is_arguments(b)) {
	      return false;
	    }
	    a = pSlice.call(a);
	    b = pSlice.call(b);
	    return deepEqual(a, b, opts);
	  }
	  if (isBuffer(a)) {
	    if (!isBuffer(b)) {
	      return false;
	    }
	    if (a.length !== b.length) return false;
	    for (i = 0; i < a.length; i++) {
	      if (a[i] !== b[i]) return false;
	    }
	    return true;
	  }
	  try {
	    var ka = keys(a),
	        kb = keys(b);
	  } catch (e) {//happens when one is a string literal and the other isn't
	    return false;
	  }
	  // having the same number of owned properties (keys incorporates
	  // hasOwnProperty)
	  if (ka.length != kb.length)
	    return false;
	  //the same set of keys (although not necessarily the same order),
	  ka.sort();
	  kb.sort();
	  //~~~cheap key test
	  for (i = ka.length - 1; i >= 0; i--) {
	    if (ka[i] != kb[i])
	      return false;
	  }
	  //equivalent values for every corresponding key, and
	  //~~~possibly expensive deep test
	  for (i = ka.length - 1; i >= 0; i--) {
	    key = ka[i];
	    if (!deepEqual(a[key], b[key], opts)) return false;
	  }
	  return typeof a === typeof b;
	}
	});

	var dateformat = createCommonjsModule(function (module, exports) {
	/*
	 * Date Format 1.2.3
	 * (c) 2007-2009 Steven Levithan <stevenlevithan.com>
	 * MIT license
	 *
	 * Includes enhancements by Scott Trenda <scott.trenda.net>
	 * and Kris Kowal <cixar.com/~kris.kowal/>
	 *
	 * Accepts a date, a mask, or a date and a mask.
	 * Returns a formatted version of the given date.
	 * The date defaults to the current date/time.
	 * The mask defaults to dateFormat.masks.default.
	 */

	(function(global) {

	  var dateFormat = (function() {
	      var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZWN]|"[^"]*"|'[^']*'/g;
	      var timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g;
	      var timezoneClip = /[^-+\dA-Z]/g;
	  
	      // Regexes and supporting functions are cached through closure
	      return function (date, mask, utc, gmt) {
	  
	        // You can't provide utc if you skip other args (use the 'UTC:' mask prefix)
	        if (arguments.length === 1 && kindOf(date) === 'string' && !/\d/.test(date)) {
	          mask = date;
	          date = undefined;
	        }
	  
	        date = date || new Date;
	  
	        if(!(date instanceof Date)) {
	          date = new Date(date);
	        }
	  
	        if (isNaN(date)) {
	          throw TypeError('Invalid date');
	        }
	  
	        mask = String(dateFormat.masks[mask] || mask || dateFormat.masks['default']);
	  
	        // Allow setting the utc/gmt argument via the mask
	        var maskSlice = mask.slice(0, 4);
	        if (maskSlice === 'UTC:' || maskSlice === 'GMT:') {
	          mask = mask.slice(4);
	          utc = true;
	          if (maskSlice === 'GMT:') {
	            gmt = true;
	          }
	        }
	  
	        var _ = utc ? 'getUTC' : 'get';
	        var d = date[_ + 'Date']();
	        var D = date[_ + 'Day']();
	        var m = date[_ + 'Month']();
	        var y = date[_ + 'FullYear']();
	        var H = date[_ + 'Hours']();
	        var M = date[_ + 'Minutes']();
	        var s = date[_ + 'Seconds']();
	        var L = date[_ + 'Milliseconds']();
	        var o = utc ? 0 : date.getTimezoneOffset();
	        var W = getWeek(date);
	        var N = getDayOfWeek(date);
	        var flags = {
	          d:    d,
	          dd:   pad(d),
	          ddd:  dateFormat.i18n.dayNames[D],
	          dddd: dateFormat.i18n.dayNames[D + 7],
	          m:    m + 1,
	          mm:   pad(m + 1),
	          mmm:  dateFormat.i18n.monthNames[m],
	          mmmm: dateFormat.i18n.monthNames[m + 12],
	          yy:   String(y).slice(2),
	          yyyy: y,
	          h:    H % 12 || 12,
	          hh:   pad(H % 12 || 12),
	          H:    H,
	          HH:   pad(H),
	          M:    M,
	          MM:   pad(M),
	          s:    s,
	          ss:   pad(s),
	          l:    pad(L, 3),
	          L:    pad(Math.round(L / 10)),
	          t:    H < 12 ? dateFormat.i18n.timeNames[0] : dateFormat.i18n.timeNames[1],
	          tt:   H < 12 ? dateFormat.i18n.timeNames[2] : dateFormat.i18n.timeNames[3],
	          T:    H < 12 ? dateFormat.i18n.timeNames[4] : dateFormat.i18n.timeNames[5],
	          TT:   H < 12 ? dateFormat.i18n.timeNames[6] : dateFormat.i18n.timeNames[7],
	          Z:    gmt ? 'GMT' : utc ? 'UTC' : (String(date).match(timezone) || ['']).pop().replace(timezoneClip, ''),
	          o:    (o > 0 ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
	          S:    ['th', 'st', 'nd', 'rd'][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10],
	          W:    W,
	          N:    N
	        };
	  
	        return mask.replace(token, function (match) {
	          if (match in flags) {
	            return flags[match];
	          }
	          return match.slice(1, match.length - 1);
	        });
	      };
	    })();

	  dateFormat.masks = {
	    'default':               'ddd mmm dd yyyy HH:MM:ss',
	    'shortDate':             'm/d/yy',
	    'mediumDate':            'mmm d, yyyy',
	    'longDate':              'mmmm d, yyyy',
	    'fullDate':              'dddd, mmmm d, yyyy',
	    'shortTime':             'h:MM TT',
	    'mediumTime':            'h:MM:ss TT',
	    'longTime':              'h:MM:ss TT Z',
	    'isoDate':               'yyyy-mm-dd',
	    'isoTime':               'HH:MM:ss',
	    'isoDateTime':           'yyyy-mm-dd\'T\'HH:MM:sso',
	    'isoUtcDateTime':        'UTC:yyyy-mm-dd\'T\'HH:MM:ss\'Z\'',
	    'expiresHeaderFormat':   'ddd, dd mmm yyyy HH:MM:ss Z'
	  };

	  // Internationalization strings
	  dateFormat.i18n = {
	    dayNames: [
	      'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
	      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
	    ],
	    monthNames: [
	      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
	      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
	    ],
	    timeNames: [
	      'a', 'p', 'am', 'pm', 'A', 'P', 'AM', 'PM'
	    ]
	  };

	function pad(val, len) {
	  val = String(val);
	  len = len || 2;
	  while (val.length < len) {
	    val = '0' + val;
	  }
	  return val;
	}

	/**
	 * Get the ISO 8601 week number
	 * Based on comments from
	 * http://techblog.procurios.nl/k/n618/news/view/33796/14863/Calculate-ISO-8601-week-and-year-in-javascript.html
	 *
	 * @param  {Object} `date`
	 * @return {Number}
	 */
	function getWeek(date) {
	  // Remove time components of date
	  var targetThursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());

	  // Change date to Thursday same week
	  targetThursday.setDate(targetThursday.getDate() - ((targetThursday.getDay() + 6) % 7) + 3);

	  // Take January 4th as it is always in week 1 (see ISO 8601)
	  var firstThursday = new Date(targetThursday.getFullYear(), 0, 4);

	  // Change date to Thursday same week
	  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);

	  // Check if daylight-saving-time-switch occurred and correct for it
	  var ds = targetThursday.getTimezoneOffset() - firstThursday.getTimezoneOffset();
	  targetThursday.setHours(targetThursday.getHours() - ds);

	  // Number of weeks between target Thursday and first Thursday
	  var weekDiff = (targetThursday - firstThursday) / (86400000*7);
	  return 1 + Math.floor(weekDiff);
	}

	/**
	 * Get ISO-8601 numeric representation of the day of the week
	 * 1 (for Monday) through 7 (for Sunday)
	 * 
	 * @param  {Object} `date`
	 * @return {Number}
	 */
	function getDayOfWeek(date) {
	  var dow = date.getDay();
	  if(dow === 0) {
	    dow = 7;
	  }
	  return dow;
	}

	/**
	 * kind-of shortcut
	 * @param  {*} val
	 * @return {String}
	 */
	function kindOf(val) {
	  if (val === null) {
	    return 'null';
	  }

	  if (val === undefined) {
	    return 'undefined';
	  }

	  if (typeof val !== 'object') {
	    return typeof val;
	  }

	  if (Array.isArray(val)) {
	    return 'array';
	  }

	  return {}.toString.call(val)
	    .slice(8, -1).toLowerCase();
	}


	  if (typeof undefined === 'function' && undefined.amd) {
	    undefined(function () {
	      return dateFormat;
	    });
	  } else {
	    module.exports = dateFormat;
	  }
	})(commonjsGlobal);
	});

	/*!
	 * repeat-string <https://github.com/jonschlinkert/repeat-string>
	 *
	 * Copyright (c) 2014-2015, Jon Schlinkert.
	 * Licensed under the MIT License.
	 */

	/**
	 * Results cache
	 */

	var res = '';
	var cache;

	/**
	 * Expose `repeat`
	 */

	var repeatString = repeat;

	/**
	 * Repeat the given `string` the specified `number`
	 * of times.
	 *
	 * **Example:**
	 *
	 * ```js
	 * var repeat = require('repeat-string');
	 * repeat('A', 5);
	 * //=> AAAAA
	 * ```
	 *
	 * @param {String} `string` The string to repeat
	 * @param {Number} `number` The number of times to repeat the string
	 * @return {String} Repeated string
	 * @api public
	 */

	function repeat(str, num) {
	  if (typeof str !== 'string') {
	    throw new TypeError('expected a string');
	  }

	  // cover common, quick use cases
	  if (num === 1) return str;
	  if (num === 2) return str + str;

	  var max = str.length * num;
	  if (cache !== str || typeof cache === 'undefined') {
	    cache = str;
	    res = '';
	  } else if (res.length >= max) {
	    return res.substr(0, max);
	  }

	  while (max > res.length && num > 1) {
	    if (num & 1) {
	      res += str;
	    }

	    num >>= 1;
	    str += str;
	  }

	  res += str;
	  res = res.substr(0, max);
	  return res;
	}

	var padLeft = function padLeft(str, num, ch) {
	  str = str.toString();

	  if (typeof num === 'undefined') {
	    return str;
	  }

	  if (ch === 0) {
	    ch = '0';
	  } else if (ch) {
	    ch = ch.toString();
	  } else {
	    ch = ' ';
	  }

	  return repeatString(ch, num - str.length) + str;
	};

	var noop = function () {};
	var link;
	var defaultExts = {
	    extension: '',
	    prefix: '',
	    suffix: ''
	};
	var supportedEncodings = ['image/png','image/jpeg','image/webp'];
	function stream(isStart, opts) {
	    if ( opts === void 0 ) opts = {};

	    return new Promise(function (resolve, reject) {
	        opts = objectAssign({}, defaultExts, opts);
	        var filename = resolveFilename(Object.assign({}, opts, {
	            extension: '',
	            frame: undefined
	        }));
	        var func = isStart ? 'streamStart' : 'streamEnd';
	        var client = getClientAPI();
	        if (client && client.output && typeof client[func] === 'function') {
	            return client[func](objectAssign({}, opts, {
	                filename: filename
	            })).then(function (ev) { return resolve(ev); });
	        } else {
	            return resolve({
	                filename: filename,
	                client: false
	            });
	        }
	    });
	}

	function streamStart(opts) {
	    if ( opts === void 0 ) opts = {};

	    return stream(true, opts);
	}

	function streamEnd(opts) {
	    if ( opts === void 0 ) opts = {};

	    return stream(false, opts);
	}

	function exportCanvas(canvas, opt) {
	    if ( opt === void 0 ) opt = {};

	    var encoding = opt.encoding || 'image/png';
	    if (!supportedEncodings.includes(encoding)) 
	        { throw new Error(("Invalid canvas encoding " + encoding)); }
	    var extension = (encoding.split('/')[1] || '').replace(/jpeg/i, 'jpg');
	    if (extension) 
	        { extension = ("." + extension).toLowerCase(); }
	    return {
	        extension: extension,
	        type: encoding,
	        dataURL: canvas.toDataURL(encoding, opt.encodingQuality)
	    };
	}

	function createBlobFromDataURL(dataURL) {
	    return new Promise(function (resolve) {
	        var splitIndex = dataURL.indexOf(',');
	        if (splitIndex === -1) {
	            resolve(new window.Blob());
	            return;
	        }
	        var base64 = dataURL.slice(splitIndex + 1);
	        var byteString = window.atob(base64);
	        var type = dataURL.slice(0, splitIndex);
	        var mimeMatch = /data:([^;]+)/.exec(type);
	        var mime = (mimeMatch ? mimeMatch[1] : '') || undefined;
	        var ab = new ArrayBuffer(byteString.length);
	        var ia = new Uint8Array(ab);
	        for (var i = 0;i < byteString.length; i++) {
	            ia[i] = byteString.charCodeAt(i);
	        }
	        resolve(new window.Blob([ab], {
	            type: mime
	        }));
	    });
	}

	function saveDataURL(dataURL, opts) {
	    if ( opts === void 0 ) opts = {};

	    return createBlobFromDataURL(dataURL).then(function (blob) { return saveBlob(blob, opts); });
	}

	function saveBlob(blob, opts) {
	    if ( opts === void 0 ) opts = {};

	    return new Promise(function (resolve) {
	        opts = objectAssign({}, defaultExts, opts);
	        var filename = opts.filename;
	        var client = getClientAPI();
	        if (client && typeof client.saveBlob === 'function' && client.output) {
	            return client.saveBlob(blob, objectAssign({}, opts, {
	                filename: filename
	            })).then(function (ev) { return resolve(ev); });
	        } else {
	            if (!link) {
	                link = document.createElement('a');
	                link.style.visibility = 'hidden';
	                link.target = '_blank';
	            }
	            link.download = filename;
	            link.href = window.URL.createObjectURL(blob);
	            document.body.appendChild(link);
	            link.onclick = (function () {
	                link.onclick = noop;
	                setTimeout(function () {
	                    window.URL.revokeObjectURL(blob);
	                    if (link.parentElement) 
	                        { link.parentElement.removeChild(link); }
	                    link.removeAttribute('href');
	                    resolve({
	                        filename: filename,
	                        client: false
	                    });
	                });
	            });
	            link.click();
	        }
	    });
	}

	function saveFile(data, opts) {
	    if ( opts === void 0 ) opts = {};

	    var parts = Array.isArray(data) ? data : [data];
	    var blob = new window.Blob(parts, {
	        type: opts.type || ''
	    });
	    return saveBlob(blob, opts);
	}

	function getTimeStamp() {
	    var dateFormatStr = "yyyy.mm.dd-HH.MM.ss";
	    return dateformat(new Date(), dateFormatStr);
	}

	function resolveFilename(opt) {
	    if ( opt === void 0 ) opt = {};

	    opt = objectAssign({}, opt);
	    if (typeof opt.file === 'function') {
	        return opt.file(opt);
	    } else if (opt.file) {
	        return opt.file;
	    }
	    var frame = null;
	    var extension = '';
	    if (typeof opt.extension === 'string') 
	        { extension = opt.extension; }
	    if (typeof opt.frame === 'number') {
	        var totalFrames;
	        if (typeof opt.totalFrames === 'number') {
	            totalFrames = opt.totalFrames;
	        } else {
	            totalFrames = Math.max(10000, opt.frame);
	        }
	        frame = padLeft(String(opt.frame), String(totalFrames).length, '0');
	    }
	    var layerStr = isFinite(opt.totalLayers) && isFinite(opt.layer) && opt.totalLayers > 1 ? ("" + (opt.layer)) : '';
	    if (frame != null) {
	        return [layerStr,frame].filter(Boolean).join('-') + extension;
	    } else {
	        var defaultFileName = opt.timeStamp;
	        return [opt.prefix,opt.name || defaultFileName,layerStr,opt.hash,opt.suffix].filter(Boolean).join('-') + extension;
	    }
	}

	var commonTypos = {
	    dimension: 'dimensions',
	    animated: 'animate',
	    animating: 'animate',
	    unit: 'units',
	    P5: 'p5',
	    pixellated: 'pixelated',
	    looping: 'loop',
	    pixelPerInch: 'pixels'
	};
	var allKeys = ['dimensions','units','pixelsPerInch','orientation','scaleToFit',
	    'scaleToView','bleed','pixelRatio','exportPixelRatio','maxPixelRatio','scaleContext',
	    'resizeCanvas','styleCanvas','canvas','context','attributes','parent','file',
	    'name','prefix','suffix','animate','playing','loop','duration','totalFrames',
	    'fps','playbackRate','timeScale','frame','time','flush','pixelated','hotkeys',
	    'p5','id','scaleToFitPadding','data','params','encoding','encodingQuality'];
	var checkSettings = function (settings) {
	    var keys = Object.keys(settings);
	    keys.forEach(function (key) {
	        if (key in commonTypos) {
	            var actual = commonTypos[key];
	            console.warn(("[canvas-sketch] Could not recognize the setting \"" + key + "\", did you mean \"" + actual + "\"?"));
	        } else if (!allKeys.includes(key)) {
	            console.warn(("[canvas-sketch] Could not recognize the setting \"" + key + "\""));
	        }
	    });
	};

	function keyboardShortcuts (opt) {
	    if ( opt === void 0 ) opt = {};

	    var handler = function (ev) {
	        if (!opt.enabled()) 
	            { return; }
	        var client = getClientAPI();
	        if (ev.keyCode === 83 && !ev.altKey && (ev.metaKey || ev.ctrlKey)) {
	            ev.preventDefault();
	            opt.save(ev);
	        } else if (ev.keyCode === 32) {
	            opt.togglePlay(ev);
	        } else if (client && !ev.altKey && ev.keyCode === 75 && (ev.metaKey || ev.ctrlKey)) {
	            ev.preventDefault();
	            opt.commit(ev);
	        }
	    };
	    var attach = function () {
	        window.addEventListener('keydown', handler);
	    };
	    var detach = function () {
	        window.removeEventListener('keydown', handler);
	    };
	    return {
	        attach: attach,
	        detach: detach
	    };
	}

	var defaultUnits = 'mm';
	var data = [['postcard',101.6,152.4],['poster-small',280,430],['poster',460,610],
	    ['poster-large',610,910],['business-card',50.8,88.9],['2r',64,89],['3r',89,127],
	    ['4r',102,152],['5r',127,178],['6r',152,203],['8r',203,254],['10r',254,305],['11r',
	    279,356],['12r',305,381],['a0',841,1189],['a1',594,841],['a2',420,594],['a3',
	    297,420],['a4',210,297],['a5',148,210],['a6',105,148],['a7',74,105],['a8',52,
	    74],['a9',37,52],['a10',26,37],['2a0',1189,1682],['4a0',1682,2378],['b0',1000,
	    1414],['b1',707,1000],['b1+',720,1020],['b2',500,707],['b2+',520,720],['b3',353,
	    500],['b4',250,353],['b5',176,250],['b6',125,176],['b7',88,125],['b8',62,88],
	    ['b9',44,62],['b10',31,44],['b11',22,32],['b12',16,22],['c0',917,1297],['c1',
	    648,917],['c2',458,648],['c3',324,458],['c4',229,324],['c5',162,229],['c6',114,
	    162],['c7',81,114],['c8',57,81],['c9',40,57],['c10',28,40],['c11',22,32],['c12',
	    16,22],['half-letter',5.5,8.5,'in'],['letter',8.5,11,'in'],['legal',8.5,14,'in'],
	    ['junior-legal',5,8,'in'],['ledger',11,17,'in'],['tabloid',11,17,'in'],['ansi-a',
	    8.5,11.0,'in'],['ansi-b',11.0,17.0,'in'],['ansi-c',17.0,22.0,'in'],['ansi-d',
	    22.0,34.0,'in'],['ansi-e',34.0,44.0,'in'],['arch-a',9,12,'in'],['arch-b',12,18,
	    'in'],['arch-c',18,24,'in'],['arch-d',24,36,'in'],['arch-e',36,48,'in'],['arch-e1',
	    30,42,'in'],['arch-e2',26,38,'in'],['arch-e3',27,39,'in']];
	var paperSizes = data.reduce(function (dict, preset) {
	    var item = {
	        units: preset[3] || defaultUnits,
	        dimensions: [preset[1],preset[2]]
	    };
	    dict[preset[0]] = item;
	    dict[preset[0].replace(/-/g, ' ')] = item;
	    return dict;
	}, {})

	var defined$1 = function () {
	    for (var i = 0; i < arguments.length; i++) {
	        if (arguments[i] !== undefined) return arguments[i];
	    }
	};

	var units = [ 'mm', 'cm', 'm', 'pc', 'pt', 'in', 'ft', 'px' ];

	var conversions = {
	  // metric
	  m: {
	    system: 'metric',
	    factor: 1
	  },
	  cm: {
	    system: 'metric',
	    factor: 1 / 100
	  },
	  mm: {
	    system: 'metric',
	    factor: 1 / 1000
	  },
	  // imperial
	  pt: {
	    system: 'imperial',
	    factor: 1 / 72
	  },
	  pc: {
	    system: 'imperial',
	    factor: 1 / 6
	  },
	  in: {
	    system: 'imperial',
	    factor: 1
	  },
	  ft: {
	    system: 'imperial',
	    factor: 12
	  }
	};

	const anchors = {
	  metric: {
	    unit: 'm',
	    ratio: 1 / 0.0254
	  },
	  imperial: {
	    unit: 'in',
	    ratio: 0.0254
	  }
	};

	function round (value, decimals) {
	  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
	}

	function convertDistance (value, fromUnit, toUnit, opts) {
	  if (typeof value !== 'number' || !isFinite(value)) throw new Error('Value must be a finite number');
	  if (!fromUnit || !toUnit) throw new Error('Must specify from and to units');

	  opts = opts || {};
	  var pixelsPerInch = defined$1(opts.pixelsPerInch, 96);
	  var precision = opts.precision;
	  var roundPixel = opts.roundPixel !== false;

	  fromUnit = fromUnit.toLowerCase();
	  toUnit = toUnit.toLowerCase();

	  if (units.indexOf(fromUnit) === -1) throw new Error('Invalid from unit "' + fromUnit + '", must be one of: ' + units.join(', '));
	  if (units.indexOf(toUnit) === -1) throw new Error('Invalid from unit "' + toUnit + '", must be one of: ' + units.join(', '));

	  if (fromUnit === toUnit) {
	    // We don't need to convert from A to B since they are the same already
	    return value;
	  }

	  var toFactor = 1;
	  var fromFactor = 1;
	  var isToPixel = false;

	  if (fromUnit === 'px') {
	    fromFactor = 1 / pixelsPerInch;
	    fromUnit = 'in';
	  }
	  if (toUnit === 'px') {
	    isToPixel = true;
	    toFactor = pixelsPerInch;
	    toUnit = 'in';
	  }

	  var fromUnitData = conversions[fromUnit];
	  var toUnitData = conversions[toUnit];

	  // source to anchor inside source's system
	  var anchor = value * fromUnitData.factor * fromFactor;

	  // if systems differ, convert one to another
	  if (fromUnitData.system !== toUnitData.system) {
	    // regular 'm' to 'in' and so forth
	    anchor *= anchors[fromUnitData.system].ratio;
	  }

	  var result = anchor / toUnitData.factor * toFactor;
	  if (isToPixel && roundPixel) {
	    result = Math.round(result);
	  } else if (typeof precision === 'number' && isFinite(precision)) {
	    result = round(result, precision);
	  }
	  return result;
	}

	var convertLength = convertDistance;
	var units_1 = units;
	convertLength.units = units_1;

	function getDimensionsFromPreset(dimensions, unitsTo, pixelsPerInch) {
	    if ( unitsTo === void 0 ) unitsTo = 'px';
	    if ( pixelsPerInch === void 0 ) pixelsPerInch = 72;

	    if (typeof dimensions === 'string') {
	        var key = dimensions.toLowerCase();
	        if (!(key in paperSizes)) {
	            throw new Error(("The dimension preset \"" + dimensions + "\" is not supported or could not be found; try using a4, a3, postcard, letter, etc."));
	        }
	        var preset = paperSizes[key];
	        return preset.dimensions.map(function (d) { return convertDistance$1(d, preset.units, unitsTo, pixelsPerInch); });
	    } else {
	        return dimensions;
	    }
	}

	function convertDistance$1(dimension, unitsFrom, unitsTo, pixelsPerInch) {
	    if ( unitsFrom === void 0 ) unitsFrom = 'px';
	    if ( unitsTo === void 0 ) unitsTo = 'px';
	    if ( pixelsPerInch === void 0 ) pixelsPerInch = 72;

	    return convertLength(dimension, unitsFrom, unitsTo, {
	        pixelsPerInch: pixelsPerInch,
	        precision: 4,
	        roundPixel: true
	    });
	}

	function checkIfHasDimensions(settings) {
	    if (!settings.dimensions) 
	        { return false; }
	    if (typeof settings.dimensions === 'string') 
	        { return true; }
	    if (Array.isArray(settings.dimensions) && settings.dimensions.length >= 2) 
	        { return true; }
	    return false;
	}

	function getParentSize(props, settings) {
	    if (!isBrowser()) {
	        return [300,150];
	    }
	    var element = settings.parent || window;
	    if (element === window || element === document || element === document.body) {
	        return [window.innerWidth,window.innerHeight];
	    } else {
	        var ref = element.getBoundingClientRect();
	        var width = ref.width;
	        var height = ref.height;
	        return [width,height];
	    }
	}

	function resizeCanvas(props, settings) {
	    var width, height;
	    var styleWidth, styleHeight;
	    var canvasWidth, canvasHeight;
	    var browser = isBrowser();
	    var dimensions = settings.dimensions;
	    var hasDimensions = checkIfHasDimensions(settings);
	    var exporting = props.exporting;
	    var scaleToFit = hasDimensions ? settings.scaleToFit !== false : false;
	    var scaleToView = !exporting && hasDimensions ? settings.scaleToView : true;
	    if (!browser) 
	        { scaleToFit = (scaleToView = false); }
	    var units = settings.units;
	    var pixelsPerInch = typeof settings.pixelsPerInch === 'number' && isFinite(settings.pixelsPerInch) ? settings.pixelsPerInch : 72;
	    var bleed = defined(settings.bleed, 0);
	    var devicePixelRatio = browser ? window.devicePixelRatio : 1;
	    var basePixelRatio = scaleToView ? devicePixelRatio : 1;
	    var pixelRatio, exportPixelRatio;
	    if (typeof settings.pixelRatio === 'number' && isFinite(settings.pixelRatio)) {
	        pixelRatio = settings.pixelRatio;
	        exportPixelRatio = defined(settings.exportPixelRatio, pixelRatio);
	    } else {
	        if (hasDimensions) {
	            pixelRatio = basePixelRatio;
	            exportPixelRatio = defined(settings.exportPixelRatio, 1);
	        } else {
	            pixelRatio = devicePixelRatio;
	            exportPixelRatio = defined(settings.exportPixelRatio, pixelRatio);
	        }
	    }
	    if (typeof settings.maxPixelRatio === 'number' && isFinite(settings.maxPixelRatio)) {
	        pixelRatio = Math.min(settings.maxPixelRatio, pixelRatio);
	    }
	    if (exporting) {
	        pixelRatio = exportPixelRatio;
	    }
	    var ref = getParentSize(props, settings);
	    var parentWidth = ref[0];
	    var parentHeight = ref[1];
	    var trimWidth, trimHeight;
	    if (hasDimensions) {
	        var result = getDimensionsFromPreset(dimensions, units, pixelsPerInch);
	        var highest = Math.max(result[0], result[1]);
	        var lowest = Math.min(result[0], result[1]);
	        if (settings.orientation) {
	            var landscape = settings.orientation === 'landscape';
	            width = landscape ? highest : lowest;
	            height = landscape ? lowest : highest;
	        } else {
	            width = result[0];
	            height = result[1];
	        }
	        trimWidth = width;
	        trimHeight = height;
	        width += bleed * 2;
	        height += bleed * 2;
	    } else {
	        width = parentWidth;
	        height = parentHeight;
	        trimWidth = width;
	        trimHeight = height;
	    }
	    var realWidth = width;
	    var realHeight = height;
	    if (hasDimensions && units) {
	        realWidth = convertDistance$1(width, units, 'px', pixelsPerInch);
	        realHeight = convertDistance$1(height, units, 'px', pixelsPerInch);
	    }
	    styleWidth = Math.round(realWidth);
	    styleHeight = Math.round(realHeight);
	    if (scaleToFit && !exporting && hasDimensions) {
	        var aspect = width / height;
	        var windowAspect = parentWidth / parentHeight;
	        var scaleToFitPadding = defined(settings.scaleToFitPadding, 40);
	        var maxWidth = Math.round(parentWidth - scaleToFitPadding * 2);
	        var maxHeight = Math.round(parentHeight - scaleToFitPadding * 2);
	        if (styleWidth > maxWidth || styleHeight > maxHeight) {
	            if (windowAspect > aspect) {
	                styleHeight = maxHeight;
	                styleWidth = Math.round(styleHeight * aspect);
	            } else {
	                styleWidth = maxWidth;
	                styleHeight = Math.round(styleWidth / aspect);
	            }
	        }
	    }
	    canvasWidth = scaleToView ? Math.round(pixelRatio * styleWidth) : Math.round(pixelRatio * realWidth);
	    canvasHeight = scaleToView ? Math.round(pixelRatio * styleHeight) : Math.round(pixelRatio * realHeight);
	    var viewportWidth = scaleToView ? Math.round(styleWidth) : Math.round(realWidth);
	    var viewportHeight = scaleToView ? Math.round(styleHeight) : Math.round(realHeight);
	    var scaleX = canvasWidth / width;
	    var scaleY = canvasHeight / height;
	    return {
	        bleed: bleed,
	        pixelRatio: pixelRatio,
	        width: width,
	        height: height,
	        dimensions: [width,height],
	        units: units || 'px',
	        scaleX: scaleX,
	        scaleY: scaleY,
	        pixelsPerInch: pixelsPerInch,
	        viewportWidth: viewportWidth,
	        viewportHeight: viewportHeight,
	        canvasWidth: canvasWidth,
	        canvasHeight: canvasHeight,
	        trimWidth: trimWidth,
	        trimHeight: trimHeight,
	        styleWidth: styleWidth,
	        styleHeight: styleHeight
	    };
	}

	var getCanvasContext_1 = getCanvasContext;
	function getCanvasContext (type, opts) {
	  if (typeof type !== 'string') {
	    throw new TypeError('must specify type string')
	  }

	  opts = opts || {};

	  if (typeof document === 'undefined' && !opts.canvas) {
	    return null // check for Node
	  }

	  var canvas = opts.canvas || document.createElement('canvas');
	  if (typeof opts.width === 'number') {
	    canvas.width = opts.width;
	  }
	  if (typeof opts.height === 'number') {
	    canvas.height = opts.height;
	  }

	  var attribs = opts;
	  var gl;
	  try {
	    var names = [ type ];
	    // prefix GL contexts
	    if (type.indexOf('webgl') === 0) {
	      names.push('experimental-' + type);
	    }

	    for (var i = 0; i < names.length; i++) {
	      gl = canvas.getContext(names[i], attribs);
	      if (gl) return gl
	    }
	  } catch (e) {
	    gl = null;
	  }
	  return (gl || null) // ensure null on fail
	}

	function createCanvasElement() {
	    if (!isBrowser()) {
	        throw new Error('It appears you are runing from Node.js or a non-browser environment. Try passing in an existing { canvas } interface instead.');
	    }
	    return document.createElement('canvas');
	}

	function createCanvas(settings) {
	    if ( settings === void 0 ) settings = {};

	    var context, canvas;
	    var ownsCanvas = false;
	    if (settings.canvas !== false) {
	        context = settings.context;
	        if (!context || typeof context === 'string') {
	            var newCanvas = settings.canvas;
	            if (!newCanvas) {
	                newCanvas = createCanvasElement();
	                ownsCanvas = true;
	            }
	            var type = context || '2d';
	            if (typeof newCanvas.getContext !== 'function') {
	                throw new Error("The specified { canvas } element does not have a getContext() function, maybe it is not a <canvas> tag?");
	            }
	            context = getCanvasContext_1(type, objectAssign({}, settings.attributes, {
	                canvas: newCanvas
	            }));
	            if (!context) {
	                throw new Error(("Failed at canvas.getContext('" + type + "') - the browser may not support this context, or a different context may already be in use with this canvas."));
	            }
	        }
	        canvas = context.canvas;
	        if (settings.canvas && canvas !== settings.canvas) {
	            throw new Error('The { canvas } and { context } settings must point to the same underlying canvas element');
	        }
	        if (settings.pixelated) {
	            context.imageSmoothingEnabled = false;
	            context.mozImageSmoothingEnabled = false;
	            context.oImageSmoothingEnabled = false;
	            context.webkitImageSmoothingEnabled = false;
	            context.msImageSmoothingEnabled = false;
	            canvas.style['image-rendering'] = 'pixelated';
	        }
	    }
	    return {
	        canvas: canvas,
	        context: context,
	        ownsCanvas: ownsCanvas
	    };
	}

	var SketchManager = function SketchManager() {
	    var this$1 = this;

	    this._settings = {};
	    this._props = {};
	    this._sketch = undefined;
	    this._raf = null;
	    this._recordTimeout = null;
	    this._lastRedrawResult = undefined;
	    this._isP5Resizing = false;
	    this._keyboardShortcuts = keyboardShortcuts({
	        enabled: function () { return this$1.settings.hotkeys !== false; },
	        save: function (ev) {
	            if (ev.shiftKey) {
	                if (this$1.props.recording) {
	                    this$1.endRecord();
	                    this$1.run();
	                } else 
	                    { this$1.record(); }
	            } else if (!this$1.props.recording) {
	                this$1.exportFrame();
	            }
	        },
	        togglePlay: function () {
	            if (this$1.props.playing) 
	                { this$1.pause(); }
	             else 
	                { this$1.play(); }
	        },
	        commit: function (ev) {
	            this$1.exportFrame({
	                commit: true
	            });
	        }
	    });
	    this._animateHandler = (function () { return this$1.animate(); });
	    this._resizeHandler = (function () {
	        var changed = this$1.resize();
	        if (changed) {
	            this$1.render();
	        }
	    });
	};

	var prototypeAccessors = { sketch: { configurable: true },settings: { configurable: true },props: { configurable: true } };
	prototypeAccessors.sketch.get = function () {
	    return this._sketch;
	};
	prototypeAccessors.settings.get = function () {
	    return this._settings;
	};
	prototypeAccessors.props.get = function () {
	    return this._props;
	};
	SketchManager.prototype._computePlayhead = function _computePlayhead (currentTime, duration) {
	    var hasDuration = typeof duration === 'number' && isFinite(duration);
	    return hasDuration ? currentTime / duration : 0;
	};
	SketchManager.prototype._computeFrame = function _computeFrame (playhead, time, totalFrames, fps) {
	    return isFinite(totalFrames) && totalFrames > 1 ? Math.floor(playhead * (totalFrames - 1)) : Math.floor(fps * time);
	};
	SketchManager.prototype._computeCurrentFrame = function _computeCurrentFrame () {
	    return this._computeFrame(this.props.playhead, this.props.time, this.props.totalFrames, this.props.fps);
	};
	SketchManager.prototype._getSizeProps = function _getSizeProps () {
	    var props = this.props;
	    return {
	        width: props.width,
	        height: props.height,
	        pixelRatio: props.pixelRatio,
	        canvasWidth: props.canvasWidth,
	        canvasHeight: props.canvasHeight,
	        viewportWidth: props.viewportWidth,
	        viewportHeight: props.viewportHeight
	    };
	};
	SketchManager.prototype.run = function run () {
	    if (!this.sketch) 
	        { throw new Error('should wait until sketch is loaded before trying to play()'); }
	    if (this.settings.playing !== false) {
	        this.play();
	    }
	    if (typeof this.sketch.dispose === 'function') {
	        console.warn('In canvas-sketch@0.0.23 the dispose() event has been renamed to unload()');
	    }
	    if (!this.props.started) {
	        this._signalBegin();
	        this.props.started = true;
	    }
	    this.tick();
	    this.render();
	    return this;
	};
	SketchManager.prototype._cancelTimeouts = function _cancelTimeouts () {
	    if (this._raf != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
	        window.cancelAnimationFrame(this._raf);
	        this._raf = null;
	    }
	    if (this._recordTimeout != null) {
	        clearTimeout(this._recordTimeout);
	        this._recordTimeout = null;
	    }
	};
	SketchManager.prototype.play = function play () {
	    var animate = this.settings.animate;
	    if ('animation' in this.settings) {
	        animate = true;
	        console.warn('[canvas-sketch] { animation } has been renamed to { animate }');
	    }
	    if (!animate) 
	        { return; }
	    if (!isBrowser()) {
	        console.error('[canvas-sketch] WARN: Using { animate } in Node.js is not yet supported');
	        return;
	    }
	    if (this.props.playing) 
	        { return; }
	    if (!this.props.started) {
	        this._signalBegin();
	        this.props.started = true;
	    }
	    this.props.playing = true;
	    this._cancelTimeouts();
	    this._lastTime = browser();
	    this._raf = window.requestAnimationFrame(this._animateHandler);
	};
	SketchManager.prototype.pause = function pause () {
	    if (this.props.recording) 
	        { this.endRecord(); }
	    this.props.playing = false;
	    this._cancelTimeouts();
	};
	SketchManager.prototype.togglePlay = function togglePlay () {
	    if (this.props.playing) 
	        { this.pause(); }
	     else 
	        { this.play(); }
	};
	SketchManager.prototype.stop = function stop () {
	    this.pause();
	    this.props.frame = 0;
	    this.props.playhead = 0;
	    this.props.time = 0;
	    this.props.deltaTime = 0;
	    this.props.started = false;
	    this.render();
	};
	SketchManager.prototype.record = function record () {
	        var this$1 = this;

	    if (this.props.recording) 
	        { return; }
	    if (!isBrowser()) {
	        console.error('[canvas-sketch] WARN: Recording from Node.js is not yet supported');
	        return;
	    }
	    this.stop();
	    this.props.playing = true;
	    this.props.recording = true;
	    var exportOpts = this._createExportOptions({
	        sequence: true
	    });
	    var frameInterval = 1 / this.props.fps;
	    this._cancelTimeouts();
	    var tick = function () {
	        if (!this$1.props.recording) 
	            { return Promise.resolve(); }
	        this$1.props.deltaTime = frameInterval;
	        this$1.tick();
	        return this$1.exportFrame(exportOpts).then(function () {
	            if (!this$1.props.recording) 
	                { return; }
	            this$1.props.deltaTime = 0;
	            this$1.props.frame++;
	            if (this$1.props.frame < this$1.props.totalFrames) {
	                this$1.props.time += frameInterval;
	                this$1.props.playhead = this$1._computePlayhead(this$1.props.time, this$1.props.duration);
	                this$1._recordTimeout = setTimeout(tick, 0);
	            } else {
	                console.log('Finished recording');
	                this$1._signalEnd();
	                this$1.endRecord();
	                this$1.stop();
	                this$1.run();
	            }
	        });
	    };
	    if (!this.props.started) {
	        this._signalBegin();
	        this.props.started = true;
	    }
	    if (this.sketch && typeof this.sketch.beginRecord === 'function') {
	        this._wrapContextScale(function (props) { return this$1.sketch.beginRecord(props); });
	    }
	    streamStart(exportOpts).catch(function (err) {
	        console.error(err);
	    }).then(function (response) {
	        this$1._raf = window.requestAnimationFrame(tick);
	    });
	};
	SketchManager.prototype._signalBegin = function _signalBegin () {
	        var this$1 = this;

	    if (this.sketch && typeof this.sketch.begin === 'function') {
	        this._wrapContextScale(function (props) { return this$1.sketch.begin(props); });
	    }
	};
	SketchManager.prototype._signalEnd = function _signalEnd () {
	        var this$1 = this;

	    if (this.sketch && typeof this.sketch.end === 'function') {
	        this._wrapContextScale(function (props) { return this$1.sketch.end(props); });
	    }
	};
	SketchManager.prototype.endRecord = function endRecord () {
	        var this$1 = this;

	    var wasRecording = this.props.recording;
	    this._cancelTimeouts();
	    this.props.recording = false;
	    this.props.deltaTime = 0;
	    this.props.playing = false;
	    return streamEnd().catch(function (err) {
	        console.error(err);
	    }).then(function () {
	        if (wasRecording && this$1.sketch && typeof this$1.sketch.endRecord === 'function') {
	            this$1._wrapContextScale(function (props) { return this$1.sketch.endRecord(props); });
	        }
	    });
	};
	SketchManager.prototype._createExportOptions = function _createExportOptions (opt) {
	        if ( opt === void 0 ) opt = {};

	    return {
	        sequence: opt.sequence,
	        save: opt.save,
	        fps: this.props.fps,
	        frame: opt.sequence ? this.props.frame : undefined,
	        file: this.settings.file,
	        name: this.settings.name,
	        prefix: this.settings.prefix,
	        suffix: this.settings.suffix,
	        encoding: this.settings.encoding,
	        encodingQuality: this.settings.encodingQuality,
	        timeStamp: opt.timeStamp || getTimeStamp(),
	        totalFrames: isFinite(this.props.totalFrames) ? Math.max(0, this.props.totalFrames) : 1000
	    };
	};
	SketchManager.prototype.exportFrame = function exportFrame (opt) {
	        var this$1 = this;
	        if ( opt === void 0 ) opt = {};

	    if (!this.sketch) 
	        { return Promise.all([]); }
	    if (typeof this.sketch.preExport === 'function') {
	        this.sketch.preExport();
	    }
	    var exportOpts = this._createExportOptions(opt);
	    var client = getClientAPI();
	    var p = Promise.resolve();
	    if (client && opt.commit && typeof client.commit === 'function') {
	        var commitOpts = objectAssign({}, exportOpts);
	        var hash = client.commit(commitOpts);
	        if (isPromise_1(hash)) 
	            { p = hash; }
	         else 
	            { p = Promise.resolve(hash); }
	    }
	    return p.then(function (hash) { return this$1._doExportFrame(objectAssign({}, exportOpts, {
	        hash: hash || ''
	    })); }).then(function (result) {
	        if (result.length === 1) 
	            { return result[0]; }
	         else 
	            { return result; }
	    });
	};
	SketchManager.prototype._doExportFrame = function _doExportFrame (exportOpts) {
	        var this$1 = this;
	        if ( exportOpts === void 0 ) exportOpts = {};

	    this._props.exporting = true;
	    this.resize();
	    var drawResult = this.render();
	    var canvas = this.props.canvas;
	    if (typeof drawResult === 'undefined') {
	        drawResult = [canvas];
	    }
	    drawResult = [].concat(drawResult).filter(Boolean);
	    drawResult = drawResult.map(function (result) {
	        var hasDataObject = typeof result === 'object' && result && ('data' in result || 'dataURL' in result);
	        var data = hasDataObject ? result.data : result;
	        var opts = hasDataObject ? objectAssign({}, result, {
	            data: data
	        }) : {
	            data: data
	        };
	        if (isCanvas(data)) {
	            var encoding = opts.encoding || exportOpts.encoding;
	            var encodingQuality = defined(opts.encodingQuality, exportOpts.encodingQuality, 0.95);
	            var ref = exportCanvas(data, {
	                encoding: encoding,
	                encodingQuality: encodingQuality
	            });
	                var dataURL = ref.dataURL;
	                var extension = ref.extension;
	                var type = ref.type;
	            return Object.assign(opts, {
	                dataURL: dataURL,
	                extension: extension,
	                type: type
	            });
	        } else {
	            return opts;
	        }
	    });
	    this._props.exporting = false;
	    this.resize();
	    this.render();
	    return Promise.all(drawResult.map(function (result, i, layerList) {
	        var curOpt = objectAssign({
	            extension: '',
	            prefix: '',
	            suffix: ''
	        }, exportOpts, result, {
	            layer: i,
	            totalLayers: layerList.length
	        });
	        var saveParam = exportOpts.save === false ? false : result.save;
	        curOpt.save = saveParam !== false;
	        curOpt.filename = resolveFilename(curOpt);
	        delete curOpt.encoding;
	        delete curOpt.encodingQuality;
	        for (var k in curOpt) {
	            if (typeof curOpt[k] === 'undefined') 
	                { delete curOpt[k]; }
	        }
	        var savePromise = Promise.resolve({});
	        if (curOpt.save) {
	            var data = curOpt.data;
	            if (curOpt.dataURL) {
	                var dataURL = curOpt.dataURL;
	                savePromise = saveDataURL(dataURL, curOpt);
	            } else {
	                savePromise = saveFile(data, curOpt);
	            }
	        }
	        return savePromise.then(function (saveResult) { return Object.assign({}, curOpt, saveResult); });
	    })).then(function (ev) {
	        var savedEvents = ev.filter(function (e) { return e.save; });
	        if (savedEvents.length > 0) {
	            var eventWithOutput = savedEvents.find(function (e) { return e.outputName; });
	            var isClient = savedEvents.some(function (e) { return e.client; });
	            var isStreaming = savedEvents.some(function (e) { return e.stream; });
	            var item;
	            if (savedEvents.length > 1) 
	                { item = savedEvents.length; }
	             else if (eventWithOutput) 
	                { item = (eventWithOutput.outputName) + "/" + (savedEvents[0].filename); }
	             else 
	                { item = "" + (savedEvents[0].filename); }
	            var ofSeq = '';
	            if (exportOpts.sequence) {
	                var hasTotalFrames = isFinite(this$1.props.totalFrames);
	                ofSeq = hasTotalFrames ? (" (frame " + (exportOpts.frame + 1) + " / " + (this$1.props.totalFrames) + ")") : (" (frame " + (exportOpts.frame) + ")");
	            } else if (savedEvents.length > 1) {
	                ofSeq = " files";
	            }
	            var client = isClient ? 'canvas-sketch-cli' : 'canvas-sketch';
	            var action = isStreaming ? 'Streaming into' : 'Exported';
	            console.log(("%c[" + client + "]%c " + action + " %c" + item + "%c" + ofSeq), 'color: #8e8e8e;', 'color: initial;', 'font-weight: bold;', 'font-weight: initial;');
	        }
	        if (typeof this$1.sketch.postExport === 'function') {
	            this$1.sketch.postExport();
	        }
	        return ev;
	    });
	};
	SketchManager.prototype._wrapContextScale = function _wrapContextScale (cb) {
	    this._preRender();
	    cb(this.props);
	    this._postRender();
	};
	SketchManager.prototype._preRender = function _preRender () {
	    var props = this.props;
	    if (!this.props.gl && props.context && !props.p5) {
	        props.context.save();
	        if (this.settings.scaleContext !== false) {
	            props.context.scale(props.scaleX, props.scaleY);
	        }
	    } else if (props.p5) {
	        props.p5.scale(props.scaleX / props.pixelRatio, props.scaleY / props.pixelRatio);
	    }
	};
	SketchManager.prototype._postRender = function _postRender () {
	    var props = this.props;
	    if (!this.props.gl && props.context && !props.p5) {
	        props.context.restore();
	    }
	    if (props.gl && this.settings.flush !== false && !props.p5) {
	        props.gl.flush();
	    }
	};
	SketchManager.prototype.tick = function tick () {
	    if (this.sketch && typeof this.sketch.tick === 'function') {
	        this._preRender();
	        this.sketch.tick(this.props);
	        this._postRender();
	    }
	};
	SketchManager.prototype.render = function render () {
	    if (this.props.p5) {
	        this._lastRedrawResult = undefined;
	        this.props.p5.redraw();
	        return this._lastRedrawResult;
	    } else {
	        return this.submitDrawCall();
	    }
	};
	SketchManager.prototype.submitDrawCall = function submitDrawCall () {
	    if (!this.sketch) 
	        { return; }
	    var props = this.props;
	    this._preRender();
	    var drawResult;
	    if (typeof this.sketch === 'function') {
	        drawResult = this.sketch(props);
	    } else if (typeof this.sketch.render === 'function') {
	        drawResult = this.sketch.render(props);
	    }
	    this._postRender();
	    return drawResult;
	};
	SketchManager.prototype.update = function update (opt) {
	        var this$1 = this;
	        if ( opt === void 0 ) opt = {};

	    var notYetSupported = ['animate'];
	    Object.keys(opt).forEach(function (key) {
	        if (notYetSupported.indexOf(key) >= 0) {
	            throw new Error(("Sorry, the { " + key + " } option is not yet supported with update()."));
	        }
	    });
	    var oldCanvas = this._settings.canvas;
	    var oldContext = this._settings.context;
	    for (var key in opt) {
	        var value = opt[key];
	        if (typeof value !== 'undefined') {
	            this$1._settings[key] = value;
	        }
	    }
	    var timeOpts = Object.assign({}, this._settings, opt);
	    if ('time' in opt && 'frame' in opt) 
	        { throw new Error('You should specify { time } or { frame } but not both'); }
	     else if ('time' in opt) 
	        { delete timeOpts.frame; }
	     else if ('frame' in opt) 
	        { delete timeOpts.time; }
	    if ('duration' in opt && 'totalFrames' in opt) 
	        { throw new Error('You should specify { duration } or { totalFrames } but not both'); }
	     else if ('duration' in opt) 
	        { delete timeOpts.totalFrames; }
	     else if ('totalFrames' in opt) 
	        { delete timeOpts.duration; }
	    if ('data' in opt) 
	        { this._props.data = opt.data; }
	    var timeProps = this.getTimeProps(timeOpts);
	    Object.assign(this._props, timeProps);
	    if (oldCanvas !== this._settings.canvas || oldContext !== this._settings.context) {
	        var ref = createCanvas(this._settings);
	            var canvas = ref.canvas;
	            var context = ref.context;
	        this.props.canvas = canvas;
	        this.props.context = context;
	        this._setupGLKey();
	        this._appendCanvasIfNeeded();
	    }
	    if (opt.p5 && typeof opt.p5 !== 'function') {
	        this.props.p5 = opt.p5;
	        this.props.p5.draw = (function () {
	            if (this$1._isP5Resizing) 
	                { return; }
	            this$1._lastRedrawResult = this$1.submitDrawCall();
	        });
	    }
	    if ('playing' in opt) {
	        if (opt.playing) 
	            { this.play(); }
	         else 
	            { this.pause(); }
	    }
	    checkSettings(this._settings);
	    this.resize();
	    this.render();
	    return this.props;
	};
	SketchManager.prototype.resize = function resize () {
	    var oldSizes = this._getSizeProps();
	    var settings = this.settings;
	    var props = this.props;
	    var newProps = resizeCanvas(props, settings);
	    Object.assign(this._props, newProps);
	    var ref = this.props;
	        var pixelRatio = ref.pixelRatio;
	        var canvasWidth = ref.canvasWidth;
	        var canvasHeight = ref.canvasHeight;
	        var styleWidth = ref.styleWidth;
	        var styleHeight = ref.styleHeight;
	    var canvas = this.props.canvas;
	    if (canvas && settings.resizeCanvas !== false) {
	        if (props.p5) {
	            if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
	                this._isP5Resizing = true;
	                props.p5.pixelDensity(pixelRatio);
	                props.p5.resizeCanvas(canvasWidth / pixelRatio, canvasHeight / pixelRatio, false);
	                this._isP5Resizing = false;
	            }
	        } else {
	            if (canvas.width !== canvasWidth) 
	                { canvas.width = canvasWidth; }
	            if (canvas.height !== canvasHeight) 
	                { canvas.height = canvasHeight; }
	        }
	        if (isBrowser() && settings.styleCanvas !== false) {
	            canvas.style.width = styleWidth + "px";
	            canvas.style.height = styleHeight + "px";
	        }
	    }
	    var newSizes = this._getSizeProps();
	    var changed = !deepEqual_1(oldSizes, newSizes);
	    if (changed) {
	        this._sizeChanged();
	    }
	    return changed;
	};
	SketchManager.prototype._sizeChanged = function _sizeChanged () {
	    if (this.sketch && typeof this.sketch.resize === 'function') {
	        this.sketch.resize(this.props);
	    }
	};
	SketchManager.prototype.animate = function animate () {
	    if (!this.props.playing) 
	        { return; }
	    if (!isBrowser()) {
	        console.error('[canvas-sketch] WARN: Animation in Node.js is not yet supported');
	        return;
	    }
	    this._raf = window.requestAnimationFrame(this._animateHandler);
	    var now = browser();
	    var fps = this.props.fps;
	    var frameIntervalMS = 1000 / fps;
	    var deltaTimeMS = now - this._lastTime;
	    var duration = this.props.duration;
	    var hasDuration = typeof duration === 'number' && isFinite(duration);
	    var isNewFrame = true;
	    var playbackRate = this.settings.playbackRate;
	    if (playbackRate === 'fixed') {
	        deltaTimeMS = frameIntervalMS;
	    } else if (playbackRate === 'throttle') {
	        if (deltaTimeMS > frameIntervalMS) {
	            now = now - deltaTimeMS % frameIntervalMS;
	            this._lastTime = now;
	        } else {
	            isNewFrame = false;
	        }
	    } else {
	        this._lastTime = now;
	    }
	    var deltaTime = deltaTimeMS / 1000;
	    var newTime = this.props.time + deltaTime * this.props.timeScale;
	    if (newTime < 0 && hasDuration) {
	        newTime = duration + newTime;
	    }
	    var isFinished = false;
	    var isLoopStart = false;
	    var looping = this.settings.loop !== false;
	    if (hasDuration && newTime >= duration) {
	        if (looping) {
	            isNewFrame = true;
	            newTime = newTime % duration;
	            isLoopStart = true;
	        } else {
	            isNewFrame = false;
	            newTime = duration;
	            isFinished = true;
	        }
	        this._signalEnd();
	    }
	    if (isNewFrame) {
	        this.props.deltaTime = deltaTime;
	        this.props.time = newTime;
	        this.props.playhead = this._computePlayhead(newTime, duration);
	        var lastFrame = this.props.frame;
	        this.props.frame = this._computeCurrentFrame();
	        if (isLoopStart) 
	            { this._signalBegin(); }
	        if (lastFrame !== this.props.frame) 
	            { this.tick(); }
	        this.render();
	        this.props.deltaTime = 0;
	    }
	    if (isFinished) {
	        this.pause();
	    }
	};
	SketchManager.prototype.dispatch = function dispatch (cb) {
	    if (typeof cb !== 'function') 
	        { throw new Error('must pass function into dispatch()'); }
	    cb(this.props);
	    this.render();
	};
	SketchManager.prototype.mount = function mount () {
	    this._appendCanvasIfNeeded();
	};
	SketchManager.prototype.unmount = function unmount () {
	    if (isBrowser()) {
	        window.removeEventListener('resize', this._resizeHandler);
	        this._keyboardShortcuts.detach();
	    }
	    if (this.props.canvas.parentElement) {
	        this.props.canvas.parentElement.removeChild(this.props.canvas);
	    }
	};
	SketchManager.prototype._appendCanvasIfNeeded = function _appendCanvasIfNeeded () {
	    if (!isBrowser()) 
	        { return; }
	    if (this.settings.parent !== false && (this.props.canvas && !this.props.canvas.parentElement)) {
	        var defaultParent = this.settings.parent || document.body;
	        defaultParent.appendChild(this.props.canvas);
	    }
	};
	SketchManager.prototype._setupGLKey = function _setupGLKey () {
	    if (this.props.context) {
	        if (isWebGLContext(this.props.context)) {
	            this._props.gl = this.props.context;
	        } else {
	            delete this._props.gl;
	        }
	    }
	};
	SketchManager.prototype.getTimeProps = function getTimeProps (settings) {
	        if ( settings === void 0 ) settings = {};

	    var duration = settings.duration;
	    var totalFrames = settings.totalFrames;
	    var timeScale = defined(settings.timeScale, 1);
	    var fps = defined(settings.fps, 24);
	    var hasDuration = typeof duration === 'number' && isFinite(duration);
	    var hasTotalFrames = typeof totalFrames === 'number' && isFinite(totalFrames);
	    var totalFramesFromDuration = hasDuration ? Math.floor(fps * duration) : undefined;
	    var durationFromTotalFrames = hasTotalFrames ? totalFrames / fps : undefined;
	    if (hasDuration && hasTotalFrames && totalFramesFromDuration !== totalFrames) {
	        throw new Error('You should specify either duration or totalFrames, but not both. Or, they must match exactly.');
	    }
	    if (typeof settings.dimensions === 'undefined' && typeof settings.units !== 'undefined') {
	        console.warn("You've specified a { units } setting but no { dimension }, so the units will be ignored.");
	    }
	    totalFrames = defined(totalFrames, totalFramesFromDuration, Infinity);
	    duration = defined(duration, durationFromTotalFrames, Infinity);
	    var startTime = settings.time;
	    var startFrame = settings.frame;
	    var hasStartTime = typeof startTime === 'number' && isFinite(startTime);
	    var hasStartFrame = typeof startFrame === 'number' && isFinite(startFrame);
	    var time = 0;
	    var frame = 0;
	    var playhead = 0;
	    if (hasStartTime && hasStartFrame) {
	        throw new Error('You should specify either start frame or time, but not both.');
	    } else if (hasStartTime) {
	        time = startTime;
	        playhead = this._computePlayhead(time, duration);
	        frame = this._computeFrame(playhead, time, totalFrames, fps);
	    } else if (hasStartFrame) {
	        frame = startFrame;
	        time = frame / fps;
	        playhead = this._computePlayhead(time, duration);
	    }
	    return {
	        playhead: playhead,
	        time: time,
	        frame: frame,
	        duration: duration,
	        totalFrames: totalFrames,
	        fps: fps,
	        timeScale: timeScale
	    };
	};
	SketchManager.prototype.setup = function setup (settings) {
	        var this$1 = this;
	        if ( settings === void 0 ) settings = {};

	    if (this.sketch) 
	        { throw new Error('Multiple setup() calls not yet supported.'); }
	    this._settings = Object.assign({}, settings, this._settings);
	    checkSettings(this._settings);
	    var ref = createCanvas(this._settings);
	        var context = ref.context;
	        var canvas = ref.canvas;
	    var timeProps = this.getTimeProps(this._settings);
	    this._props = Object.assign({}, timeProps,
	        {canvas: canvas,
	        context: context,
	        deltaTime: 0,
	        started: false,
	        exporting: false,
	        playing: false,
	        recording: false,
	        settings: this.settings,
	        data: this.settings.data,
	        render: function () { return this$1.render(); },
	        togglePlay: function () { return this$1.togglePlay(); },
	        dispatch: function (cb) { return this$1.dispatch(cb); },
	        tick: function () { return this$1.tick(); },
	        resize: function () { return this$1.resize(); },
	        update: function (opt) { return this$1.update(opt); },
	        exportFrame: function (opt) { return this$1.exportFrame(opt); },
	        record: function () { return this$1.record(); },
	        play: function () { return this$1.play(); },
	        pause: function () { return this$1.pause(); },
	        stop: function () { return this$1.stop(); }});
	    this._setupGLKey();
	    this.resize();
	};
	SketchManager.prototype.loadAndRun = function loadAndRun (canvasSketch, newSettings) {
	        var this$1 = this;

	    return this.load(canvasSketch, newSettings).then(function () {
	        this$1.run();
	        return this$1;
	    });
	};
	SketchManager.prototype.unload = function unload () {
	        var this$1 = this;

	    this.pause();
	    if (!this.sketch) 
	        { return; }
	    if (typeof this.sketch.unload === 'function') {
	        this._wrapContextScale(function (props) { return this$1.sketch.unload(props); });
	    }
	    this._sketch = null;
	};
	SketchManager.prototype.destroy = function destroy () {
	    this.unload();
	    this.unmount();
	};
	SketchManager.prototype.load = function load (createSketch, newSettings) {
	        var this$1 = this;

	    if (typeof createSketch !== 'function') {
	        throw new Error('The function must take in a function as the first parameter. Example:\n  canvasSketcher(() => { ... }, settings)');
	    }
	    if (this.sketch) {
	        this.unload();
	    }
	    if (typeof newSettings !== 'undefined') {
	        this.update(newSettings);
	    }
	    this._preRender();
	    var preload = Promise.resolve();
	    if (this.settings.p5) {
	        if (!isBrowser()) {
	            throw new Error('[canvas-sketch] ERROR: Using p5.js in Node.js is not supported');
	        }
	        preload = new Promise(function (resolve) {
	            var P5Constructor = this$1.settings.p5;
	            var preload;
	            if (P5Constructor.p5) {
	                preload = P5Constructor.preload;
	                P5Constructor = P5Constructor.p5;
	            }
	            var p5Sketch = function (p5) {
	                if (preload) 
	                    { p5.preload = (function () { return preload(p5); }); }
	                p5.setup = (function () {
	                    var props = this$1.props;
	                    var isGL = this$1.settings.context === 'webgl';
	                    var renderer = isGL ? p5.WEBGL : p5.P2D;
	                    p5.noLoop();
	                    p5.pixelDensity(props.pixelRatio);
	                    p5.createCanvas(props.viewportWidth, props.viewportHeight, renderer);
	                    if (isGL && this$1.settings.attributes) {
	                        p5.setAttributes(this$1.settings.attributes);
	                    }
	                    this$1.update({
	                        p5: p5,
	                        canvas: p5.canvas,
	                        context: p5._renderer.drawingContext
	                    });
	                    resolve();
	                });
	            };
	            if (typeof P5Constructor === 'function') {
	                new P5Constructor(p5Sketch);
	            } else {
	                if (typeof window.createCanvas !== 'function') {
	                    throw new Error("{ p5 } setting is passed but can't find p5.js in global (window) scope. Maybe you did not create it globally?\nnew p5(); // <-- attaches to global scope");
	                }
	                p5Sketch(window);
	            }
	        });
	    }
	    return preload.then(function () {
	        var loader = createSketch(this$1.props);
	        if (!isPromise_1(loader)) {
	            loader = Promise.resolve(loader);
	        }
	        return loader;
	    }).then(function (sketch) {
	        if (!sketch) 
	            { sketch = {}; }
	        this$1._sketch = sketch;
	        if (isBrowser()) {
	            this$1._keyboardShortcuts.attach();
	            window.addEventListener('resize', this$1._resizeHandler);
	        }
	        this$1._postRender();
	        this$1._sizeChanged();
	        return this$1;
	    }).catch(function (err) {
	        console.warn('Could not start sketch, the async loading function rejected with an error:\n    Error: ' + err.message);
	        throw err;
	    });
	};

	Object.defineProperties( SketchManager.prototype, prototypeAccessors );

	var CACHE = 'hot-id-cache';
	var runtimeCollisions = [];
	function isHotReload() {
	    var client = getClientAPI();
	    return client && client.hot;
	}

	function cacheGet(id) {
	    var client = getClientAPI();
	    if (!client) 
	        { return undefined; }
	    client[CACHE] = client[CACHE] || {};
	    return client[CACHE][id];
	}

	function cachePut(id, data) {
	    var client = getClientAPI();
	    if (!client) 
	        { return undefined; }
	    client[CACHE] = client[CACHE] || {};
	    client[CACHE][id] = data;
	}

	function getTimeProp(oldManager, newSettings) {
	    return newSettings.animate ? {
	        time: oldManager.props.time
	    } : undefined;
	}

	function canvasSketch(sketch, settings) {
	    if ( settings === void 0 ) settings = {};

	    if (settings.p5) {
	        if (settings.canvas || settings.context && typeof settings.context !== 'string') {
	            throw new Error("In { p5 } mode, you can't pass your own canvas or context, unless the context is a \"webgl\" or \"2d\" string");
	        }
	        var context = typeof settings.context === 'string' ? settings.context : false;
	        settings = Object.assign({}, settings, {
	            canvas: false,
	            context: context
	        });
	    }
	    var isHot = isHotReload();
	    var hotID;
	    if (isHot) {
	        hotID = defined(settings.id, '$__DEFAULT_CANVAS_SKETCH_ID__$');
	    }
	    var isInjecting = isHot && typeof hotID === 'string';
	    if (isInjecting && runtimeCollisions.includes(hotID)) {
	        console.warn("Warning: You have multiple calls to canvasSketch() in --hot mode. You must pass unique { id } strings in settings to enable hot reload across multiple sketches. ", hotID);
	        isInjecting = false;
	    }
	    var preload = Promise.resolve();
	    if (isInjecting) {
	        runtimeCollisions.push(hotID);
	        var previousData = cacheGet(hotID);
	        if (previousData) {
	            var next = function () {
	                var newProps = getTimeProp(previousData.manager, settings);
	                previousData.manager.destroy();
	                return newProps;
	            };
	            preload = previousData.load.then(next).catch(next);
	        }
	    }
	    return preload.then(function (newProps) {
	        var manager = new SketchManager();
	        var result;
	        if (sketch) {
	            settings = Object.assign({}, settings, newProps);
	            manager.setup(settings);
	            manager.mount();
	            result = manager.loadAndRun(sketch);
	        } else {
	            result = Promise.resolve(manager);
	        }
	        if (isInjecting) {
	            cachePut(hotID, {
	                load: result,
	                manager: manager
	            });
	        }
	        return result;
	    });
	}

	canvasSketch.canvasSketch = canvasSketch;
	canvasSketch.PaperSizes = paperSizes;

	return canvasSketch;

})));


}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],8:[function(require,module,exports){
module.exports = function () {
    for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] !== undefined) return arguments[i];
    }
};

},{}],9:[function(require,module,exports){
(function (global){(function (){
'use strict';

var width = 256;// each RC4 output is 0 <= x < 256
var chunks = 6;// at least six RC4 outputs for each double
var digits = 52;// there are 52 significant digits in a double
var pool = [];// pool: entropy pool starts empty
var GLOBAL = typeof global === 'undefined' ? window : global;

//
// The following constants are related to IEEE 754 limits.
//
var startdenom = Math.pow(width, chunks),
    significance = Math.pow(2, digits),
    overflow = significance * 2,
    mask = width - 1;


var oldRandom = Math.random;

//
// seedrandom()
// This is the seedrandom function described above.
//
module.exports = function(seed, options) {
  if (options && options.global === true) {
    options.global = false;
    Math.random = module.exports(seed, options);
    options.global = true;
    return Math.random;
  }
  var use_entropy = (options && options.entropy) || false;
  var key = [];

  // Flatten the seed string or build one from local entropy if needed.
  var shortseed = mixkey(flatten(
    use_entropy ? [seed, tostring(pool)] :
    0 in arguments ? seed : autoseed(), 3), key);

  // Use the seed to initialize an ARC4 generator.
  var arc4 = new ARC4(key);

  // Mix the randomness into accumulated entropy.
  mixkey(tostring(arc4.S), pool);

  // Override Math.random

  // This function returns a random double in [0, 1) that contains
  // randomness in every bit of the mantissa of the IEEE 754 value.

  return function() {         // Closure to return a random double:
    var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
        d = startdenom,                 //   and denominator d = 2 ^ 48.
        x = 0;                          //   and no 'extra last byte'.
    while (n < significance) {          // Fill up all significant digits by
      n = (n + x) * width;              //   shifting numerator and
      d *= width;                       //   denominator and generating a
      x = arc4.g(1);                    //   new least-significant-byte.
    }
    while (n >= overflow) {             // To avoid rounding up, before adding
      n /= 2;                           //   last byte, shift everything
      d /= 2;                           //   right using integer Math until
      x >>>= 1;                         //   we have exactly the desired bits.
    }
    return (n + x) / d;                 // Form the number within [0, 1).
  };
};

module.exports.resetGlobal = function () {
  Math.random = oldRandom;
};

//
// ARC4
//
// An ARC4 implementation.  The constructor takes a key in the form of
// an array of at most (width) integers that should be 0 <= x < (width).
//
// The g(count) method returns a pseudorandom integer that concatenates
// the next (count) outputs from ARC4.  Its return value is a number x
// that is in the range 0 <= x < (width ^ count).
//
/** @constructor */
function ARC4(key) {
  var t, keylen = key.length,
      me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

  // The empty key [] is treated as [0].
  if (!keylen) { key = [keylen++]; }

  // Set up S using the standard key scheduling algorithm.
  while (i < width) {
    s[i] = i++;
  }
  for (i = 0; i < width; i++) {
    s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
    s[j] = t;
  }

  // The "g" method returns the next (count) outputs as one number.
  (me.g = function(count) {
    // Using instance members instead of closure state nearly doubles speed.
    var t, r = 0,
        i = me.i, j = me.j, s = me.S;
    while (count--) {
      t = s[i = mask & (i + 1)];
      r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
    }
    me.i = i; me.j = j;
    return r;
    // For robust unpredictability discard an initial batch of values.
    // See http://www.rsa.com/rsalabs/node.asp?id=2009
  })(width);
}

//
// flatten()
// Converts an object tree to nested arrays of strings.
//
function flatten(obj, depth) {
  var result = [], typ = (typeof obj)[0], prop;
  if (depth && typ == 'o') {
    for (prop in obj) {
      try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
    }
  }
  return (result.length ? result : typ == 's' ? obj : obj + '\0');
}

//
// mixkey()
// Mixes a string seed into a key that is an array of integers, and
// returns a shortened string seed that is equivalent to the result key.
//
function mixkey(seed, key) {
  var stringseed = seed + '', smear, j = 0;
  while (j < stringseed.length) {
    key[mask & j] =
      mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
  }
  return tostring(key);
}

//
// autoseed()
// Returns an object for autoseeding, using window.crypto if available.
//
/** @param {Uint8Array=} seed */
function autoseed(seed) {
  try {
    GLOBAL.crypto.getRandomValues(seed = new Uint8Array(width));
    return tostring(seed);
  } catch (e) {
    return [+new Date, GLOBAL, GLOBAL.navigator && GLOBAL.navigator.plugins,
            GLOBAL.screen, tostring(pool)];
  }
}

//
// tostring()
// Converts an array of charcodes to a string
//
function tostring(a) {
  return String.fromCharCode.apply(0, a);
}

//
// When seedrandom.js is loaded, we immediately mix a few bits
// from the built-in RNG into the entropy pool.  Because we do
// not want to intefere with determinstic PRNG state later,
// seedrandom will not call Math.random on its own again after
// initialization.
//
mixkey(Math.random(), pool);

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){
/*
 * A fast javascript implementation of simplex noise by Jonas Wagner

Based on a speed-improved simplex noise algorithm for 2D, 3D and 4D in Java.
Which is based on example code by Stefan Gustavson (stegu@itn.liu.se).
With Optimisations by Peter Eastman (peastman@drizzle.stanford.edu).
Better rank ordering method by Stefan Gustavson in 2012.


 Copyright (c) 2018 Jonas Wagner

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
(function() {
  'use strict';

  var F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  var G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
  var F3 = 1.0 / 3.0;
  var G3 = 1.0 / 6.0;
  var F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
  var G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

  function SimplexNoise(randomOrSeed) {
    var random;
    if (typeof randomOrSeed == 'function') {
      random = randomOrSeed;
    }
    else if (randomOrSeed) {
      random = alea(randomOrSeed);
    } else {
      random = Math.random;
    }
    this.p = buildPermutationTable(random);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (var i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }

  }
  SimplexNoise.prototype = {
    grad3: new Float32Array([1, 1, 0,
      -1, 1, 0,
      1, -1, 0,

      -1, -1, 0,
      1, 0, 1,
      -1, 0, 1,

      1, 0, -1,
      -1, 0, -1,
      0, 1, 1,

      0, -1, 1,
      0, 1, -1,
      0, -1, -1]),
    grad4: new Float32Array([0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
      0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
      1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
      -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
      1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
      -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
      1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
      -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0]),
    noise2D: function(xin, yin) {
      var permMod12 = this.permMod12;
      var perm = this.perm;
      var grad3 = this.grad3;
      var n0 = 0; // Noise contributions from the three corners
      var n1 = 0;
      var n2 = 0;
      // Skew the input space to determine which simplex cell we're in
      var s = (xin + yin) * F2; // Hairy factor for 2D
      var i = Math.floor(xin + s);
      var j = Math.floor(yin + s);
      var t = (i + j) * G2;
      var X0 = i - t; // Unskew the cell origin back to (x,y) space
      var Y0 = j - t;
      var x0 = xin - X0; // The x,y distances from the cell origin
      var y0 = yin - Y0;
      // For the 2D case, the simplex shape is an equilateral triangle.
      // Determine which simplex we are in.
      var i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
      if (x0 > y0) {
        i1 = 1;
        j1 = 0;
      } // lower triangle, XY order: (0,0)->(1,0)->(1,1)
      else {
        i1 = 0;
        j1 = 1;
      } // upper triangle, YX order: (0,0)->(0,1)->(1,1)
      // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
      // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
      // c = (3-sqrt(3))/6
      var x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
      var y1 = y0 - j1 + G2;
      var x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
      var y2 = y0 - 1.0 + 2.0 * G2;
      // Work out the hashed gradient indices of the three simplex corners
      var ii = i & 255;
      var jj = j & 255;
      // Calculate the contribution from the three corners
      var t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) {
        var gi0 = permMod12[ii + perm[jj]] * 3;
        t0 *= t0;
        n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0); // (x,y) of grad3 used for 2D gradient
      }
      var t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) {
        var gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
        t1 *= t1;
        n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
      }
      var t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) {
        var gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;
        t2 *= t2;
        n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
      }
      // Add contributions from each corner to get the final noise value.
      // The result is scaled to return values in the interval [-1,1].
      return 70.0 * (n0 + n1 + n2);
    },
    // 3D simplex noise
    noise3D: function(xin, yin, zin) {
      var permMod12 = this.permMod12;
      var perm = this.perm;
      var grad3 = this.grad3;
      var n0, n1, n2, n3; // Noise contributions from the four corners
      // Skew the input space to determine which simplex cell we're in
      var s = (xin + yin + zin) * F3; // Very nice and simple skew factor for 3D
      var i = Math.floor(xin + s);
      var j = Math.floor(yin + s);
      var k = Math.floor(zin + s);
      var t = (i + j + k) * G3;
      var X0 = i - t; // Unskew the cell origin back to (x,y,z) space
      var Y0 = j - t;
      var Z0 = k - t;
      var x0 = xin - X0; // The x,y,z distances from the cell origin
      var y0 = yin - Y0;
      var z0 = zin - Z0;
      // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
      // Determine which simplex we are in.
      var i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
      var i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
      if (x0 >= y0) {
        if (y0 >= z0) {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        } // X Y Z order
        else if (x0 >= z0) {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        } // X Z Y order
        else {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        } // Z X Y order
      }
      else { // x0<y0
        if (y0 < z0) {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        } // Z Y X order
        else if (x0 < z0) {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        } // Y Z X order
        else {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        } // Y X Z order
      }
      // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
      // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
      // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
      // c = 1/6.
      var x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords
      var y1 = y0 - j1 + G3;
      var z1 = z0 - k1 + G3;
      var x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords
      var y2 = y0 - j2 + 2.0 * G3;
      var z2 = z0 - k2 + 2.0 * G3;
      var x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords
      var y3 = y0 - 1.0 + 3.0 * G3;
      var z3 = z0 - 1.0 + 3.0 * G3;
      // Work out the hashed gradient indices of the four simplex corners
      var ii = i & 255;
      var jj = j & 255;
      var kk = k & 255;
      // Calculate the contribution from the four corners
      var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0.0;
      else {
        var gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
        t0 *= t0;
        n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0);
      }
      var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0.0;
      else {
        var gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
        t1 *= t1;
        n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1);
      }
      var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0.0;
      else {
        var gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
        t2 *= t2;
        n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2);
      }
      var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0.0;
      else {
        var gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
        t3 *= t3;
        n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3);
      }
      // Add contributions from each corner to get the final noise value.
      // The result is scaled to stay just inside [-1,1]
      return 32.0 * (n0 + n1 + n2 + n3);
    },
    // 4D simplex noise, better simplex rank ordering method 2012-03-09
    noise4D: function(x, y, z, w) {
      var perm = this.perm;
      var grad4 = this.grad4;

      var n0, n1, n2, n3, n4; // Noise contributions from the five corners
      // Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
      var s = (x + y + z + w) * F4; // Factor for 4D skewing
      var i = Math.floor(x + s);
      var j = Math.floor(y + s);
      var k = Math.floor(z + s);
      var l = Math.floor(w + s);
      var t = (i + j + k + l) * G4; // Factor for 4D unskewing
      var X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space
      var Y0 = j - t;
      var Z0 = k - t;
      var W0 = l - t;
      var x0 = x - X0; // The x,y,z,w distances from the cell origin
      var y0 = y - Y0;
      var z0 = z - Z0;
      var w0 = w - W0;
      // For the 4D case, the simplex is a 4D shape I won't even try to describe.
      // To find out which of the 24 possible simplices we're in, we need to
      // determine the magnitude ordering of x0, y0, z0 and w0.
      // Six pair-wise comparisons are performed between each possible pair
      // of the four coordinates, and the results are used to rank the numbers.
      var rankx = 0;
      var ranky = 0;
      var rankz = 0;
      var rankw = 0;
      if (x0 > y0) rankx++;
      else ranky++;
      if (x0 > z0) rankx++;
      else rankz++;
      if (x0 > w0) rankx++;
      else rankw++;
      if (y0 > z0) ranky++;
      else rankz++;
      if (y0 > w0) ranky++;
      else rankw++;
      if (z0 > w0) rankz++;
      else rankw++;
      var i1, j1, k1, l1; // The integer offsets for the second simplex corner
      var i2, j2, k2, l2; // The integer offsets for the third simplex corner
      var i3, j3, k3, l3; // The integer offsets for the fourth simplex corner
      // simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
      // Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
      // impossible. Only the 24 indices which have non-zero entries make any sense.
      // We use a thresholding to set the coordinates in turn from the largest magnitude.
      // Rank 3 denotes the largest coordinate.
      i1 = rankx >= 3 ? 1 : 0;
      j1 = ranky >= 3 ? 1 : 0;
      k1 = rankz >= 3 ? 1 : 0;
      l1 = rankw >= 3 ? 1 : 0;
      // Rank 2 denotes the second largest coordinate.
      i2 = rankx >= 2 ? 1 : 0;
      j2 = ranky >= 2 ? 1 : 0;
      k2 = rankz >= 2 ? 1 : 0;
      l2 = rankw >= 2 ? 1 : 0;
      // Rank 1 denotes the second smallest coordinate.
      i3 = rankx >= 1 ? 1 : 0;
      j3 = ranky >= 1 ? 1 : 0;
      k3 = rankz >= 1 ? 1 : 0;
      l3 = rankw >= 1 ? 1 : 0;
      // The fifth corner has all coordinate offsets = 1, so no need to compute that.
      var x1 = x0 - i1 + G4; // Offsets for second corner in (x,y,z,w) coords
      var y1 = y0 - j1 + G4;
      var z1 = z0 - k1 + G4;
      var w1 = w0 - l1 + G4;
      var x2 = x0 - i2 + 2.0 * G4; // Offsets for third corner in (x,y,z,w) coords
      var y2 = y0 - j2 + 2.0 * G4;
      var z2 = z0 - k2 + 2.0 * G4;
      var w2 = w0 - l2 + 2.0 * G4;
      var x3 = x0 - i3 + 3.0 * G4; // Offsets for fourth corner in (x,y,z,w) coords
      var y3 = y0 - j3 + 3.0 * G4;
      var z3 = z0 - k3 + 3.0 * G4;
      var w3 = w0 - l3 + 3.0 * G4;
      var x4 = x0 - 1.0 + 4.0 * G4; // Offsets for last corner in (x,y,z,w) coords
      var y4 = y0 - 1.0 + 4.0 * G4;
      var z4 = z0 - 1.0 + 4.0 * G4;
      var w4 = w0 - 1.0 + 4.0 * G4;
      // Work out the hashed gradient indices of the five simplex corners
      var ii = i & 255;
      var jj = j & 255;
      var kk = k & 255;
      var ll = l & 255;
      // Calculate the contribution from the five corners
      var t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
      if (t0 < 0) n0 = 0.0;
      else {
        var gi0 = (perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32) * 4;
        t0 *= t0;
        n0 = t0 * t0 * (grad4[gi0] * x0 + grad4[gi0 + 1] * y0 + grad4[gi0 + 2] * z0 + grad4[gi0 + 3] * w0);
      }
      var t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
      if (t1 < 0) n1 = 0.0;
      else {
        var gi1 = (perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32) * 4;
        t1 *= t1;
        n1 = t1 * t1 * (grad4[gi1] * x1 + grad4[gi1 + 1] * y1 + grad4[gi1 + 2] * z1 + grad4[gi1 + 3] * w1);
      }
      var t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
      if (t2 < 0) n2 = 0.0;
      else {
        var gi2 = (perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32) * 4;
        t2 *= t2;
        n2 = t2 * t2 * (grad4[gi2] * x2 + grad4[gi2 + 1] * y2 + grad4[gi2 + 2] * z2 + grad4[gi2 + 3] * w2);
      }
      var t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
      if (t3 < 0) n3 = 0.0;
      else {
        var gi3 = (perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32) * 4;
        t3 *= t3;
        n3 = t3 * t3 * (grad4[gi3] * x3 + grad4[gi3 + 1] * y3 + grad4[gi3 + 2] * z3 + grad4[gi3 + 3] * w3);
      }
      var t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
      if (t4 < 0) n4 = 0.0;
      else {
        var gi4 = (perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32) * 4;
        t4 *= t4;
        n4 = t4 * t4 * (grad4[gi4] * x4 + grad4[gi4 + 1] * y4 + grad4[gi4 + 2] * z4 + grad4[gi4 + 3] * w4);
      }
      // Sum up and scale the result to cover the range [-1,1]
      return 27.0 * (n0 + n1 + n2 + n3 + n4);
    }
  };

  function buildPermutationTable(random) {
    var i;
    var p = new Uint8Array(256);
    for (i = 0; i < 256; i++) {
      p[i] = i;
    }
    for (i = 0; i < 255; i++) {
      var r = i + ~~(random() * (256 - i));
      var aux = p[i];
      p[i] = p[r];
      p[r] = aux;
    }
    return p;
  }
  SimplexNoise._buildPermutationTable = buildPermutationTable;

  function alea() {
    // Johannes Baagøe <baagoe@baagoe.com>, 2010
    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    var c = 1;

    var mash = masher();
    s0 = mash(' ');
    s1 = mash(' ');
    s2 = mash(' ');

    for (var i = 0; i < arguments.length; i++) {
      s0 -= mash(arguments[i]);
      if (s0 < 0) {
        s0 += 1;
      }
      s1 -= mash(arguments[i]);
      if (s1 < 0) {
        s1 += 1;
      }
      s2 -= mash(arguments[i]);
      if (s2 < 0) {
        s2 += 1;
      }
    }
    mash = null;
    return function() {
      var t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
      s0 = s1;
      s1 = s2;
      return s2 = t - (c = t | 0);
    };
  }
  function masher() {
    var n = 0xefc8249d;
    return function(data) {
      data = data.toString();
      for (var i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        var h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 0x100000000; // 2^32
      }
      return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
    };
  }

  // amd
  if (typeof define !== 'undefined' && define.amd) define(function() {return SimplexNoise;});
  // common js
  if (typeof exports !== 'undefined') exports.SimplexNoise = SimplexNoise;
  // browser
  else if (typeof window !== 'undefined') window.SimplexNoise = SimplexNoise;
  // nodejs
  if (typeof module !== 'undefined') {
    module.exports = SimplexNoise;
  }

})();

},{}],11:[function(require,module,exports){
(function (global){(function (){

global.CANVAS_SKETCH_DEFAULT_STORAGE_KEY = "D:\\Manuel\\canvas-sketch\\examples\\animated-scribble-curves.js";

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}]},{},[11,1,2,3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6L1VzZXJzL0pvdmUvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC1jbGkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIkM6L1VzZXJzL0pvdmUvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC1jbGkvc3JjL2luc3RydW1lbnRhdGlvbi9jbGllbnQtZW5hYmxlLW91dHB1dC5qcyIsIkM6L1VzZXJzL0pvdmUvQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC1jbGkvc3JjL2luc3RydW1lbnRhdGlvbi9jbGllbnQuanMiLCJhbmltYXRlZC1zY3JpYmJsZS1jdXJ2ZXMuanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC11dGlsL2xpYi93cmFwLmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gtdXRpbC9tYXRoLmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gtdXRpbC9yYW5kb20uanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL25vZGVfbW9kdWxlcy9vYmplY3QtYXNzaWduL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9ub2RlX21vZHVsZXMvcmlnaHQtbm93L2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL25vZGVfbW9kdWxlcy9pcy1wcm9taXNlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9ub2RlX21vZHVsZXMvaXMtZG9tL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9saWIvdXRpbC5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbm9kZV9tb2R1bGVzL2RlZXAtZXF1YWwvbGliL2tleXMuanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL25vZGVfbW9kdWxlcy9kZWVwLWVxdWFsL2xpYi9pc19hcmd1bWVudHMuanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL25vZGVfbW9kdWxlcy9kZWVwLWVxdWFsL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9ub2RlX21vZHVsZXMvZGF0ZWZvcm1hdC9saWIvZGF0ZWZvcm1hdC5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbm9kZV9tb2R1bGVzL3JlcGVhdC1zdHJpbmcvaW5kZXguanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL25vZGVfbW9kdWxlcy9wYWQtbGVmdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbGliL3NhdmUuanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2xpYi9hY2Nlc3NpYmlsaXR5LmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9saWIvY29yZS9rZXlib2FyZFNob3J0Y3V0cy5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbGliL3BhcGVyLXNpemVzLmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9ub2RlX21vZHVsZXMvZGVmaW5lZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbm9kZV9tb2R1bGVzL2NvbnZlcnQtbGVuZ3RoL2NvbnZlcnQtbGVuZ3RoLmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9saWIvZGlzdGFuY2VzLmpzIiwibm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvZGlzdC9ub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9saWIvY29yZS9yZXNpemVDYW52YXMuanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL25vZGVfbW9kdWxlcy9nZXQtY2FudmFzLWNvbnRleHQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvY2FudmFzLXNrZXRjaC9kaXN0L25vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2xpYi9jb3JlL2NyZWF0ZUNhbnZhcy5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbGliL2NvcmUvU2tldGNoTWFuYWdlci5qcyIsIm5vZGVfbW9kdWxlcy9jYW52YXMtc2tldGNoL2Rpc3Qvbm9kZV9tb2R1bGVzL2NhbnZhcy1za2V0Y2gvbGliL2NhbnZhcy1za2V0Y2guanMiLCJub2RlX21vZHVsZXMvZGVmaW5lZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zZWVkLXJhbmRvbS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9zaW1wbGV4LW5vaXNlL3NpbXBsZXgtbm9pc2UuanMiLCJjYW52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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Q0N4VUE7Ozs7OztDQVFBLElBQUkscUJBQXFCLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFDO0NBQ3pELElBQUksY0FBYyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDO0NBQ3JELElBQUksZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FB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SUFBSSxFQUFFO1dBQ2xCLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUM7V0FDdkIsQ0FBQyxLQUFLLENBQUM7V0FDUCxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztXQUNaLENBQUMsS0FBSyxDQUFDO1dBQ1AsRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7V0FDWixDQUFDLEtBQUssQ0FBQztXQUNQLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1dBQ1osQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1dBQ2YsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztXQUM3QixDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7V0FDMUUsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1dBQzFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztXQUMxRSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7V0FDMUUsQ0FBQyxLQUFLLEdBQUcsR0FBRyxLQUFLLEdBQUcsR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztXQUN4RyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1dBQ3pGLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztXQUNsRixDQUFDLEtBQUssQ0FBQztXQUNQLENBQUMsS0FBSyxDQUFDO1VBQ1IsQ0FBQzs7U0FFRixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFVBQVUsS0FBSyxFQUFFO1dBQzFDLElBQUksS0FBSyxJQUFJLEtBQUssRUFBRTthQUNsQixPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyQjtXQUNELE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztVQUN6QyxDQUFDLENBQUM7UUFDSixDQUFDO01BQ0gsR0FBRyxDQUFDOztHQUVQLFVBQVUsQ0FBQyxLQUFLLEdBQUc7S0FDakIsU0FBUyxnQkFBZ0IsMEJBQTBCO0tBQ25ELFdBQVcsY0FBYyxRQUFRO0tBQ2pDLFlBQVksYUFBYSxhQUFhO0tBQ3RDLFVBQVUsZUFBZSxjQUFjO0tBQ3ZDLFVBQVUsZUFBZSxvQkFBb0I7S0FDN0MsV0FBVyxjQUFjLFNBQVM7S0FDbEMsWUFBWSxhQUFhLFlBQVk7S0FDckMsVUFBVSxlQUFlLGNBQWM7S0FDdkMsU0FBUyxnQkFBZ0IsWUFBWTtLQUNyQyxTQUFTLGdCQUFnQixVQUFVO0tBQ25DLGFBQWEsWUFBWSwwQkFBMEI7S0FDbkQsZ0JBQWdCLFNBQVMsa0NBQWtDO0tBQzNELHFCQUFxQixJQUFJLDZCQUE2QjtJQUN2RCxDQUFDOzs7R0FHRixVQUFVLENBQUMsSUFBSSxHQUFHO0tBQ2hCLFFBQVEsRUFBRTtPQUNSLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7T0FDL0MsUUFBUSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsVUFBVTtNQUM3RTtLQUNELFVBQVUsRUFBRTtPQUNWLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSztPQUNsRixTQUFTLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFVBQVU7TUFDekg7S0FDRCxTQUFTLEVBQUU7T0FDVCxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSTtNQUMzQztJQUNGLENBQUM7O0NBRUosU0FBUyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtHQUNyQixHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0dBQ2xCLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDO0dBQ2YsT0FBTyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtLQUN2QixHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNqQjtHQUNELE9BQU8sR0FBRyxDQUFDO0VBQ1o7Ozs7Ozs7Ozs7Q0FVRCxTQUFTLE9BQU8sQ0FBQyxJQUFJLEVBQUU7O0dBRXJCLElBQUksY0FBYyxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7OztHQUduRixjQUFjLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7OztHQUczRixJQUFJLGFBQWEsR0FBRyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDOzs7R0FHakUsYUFBYSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDOzs7R0FHeEYsSUFBSSxFQUFFLEdBQUcsY0FBYyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixFQUFFLENBQUM7R0FDaEYsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7OztHQUd4RCxJQUFJLFFBQVEsR0FBRyxDQUFDLGNBQWMsR0FBRyxhQUFhLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0dBQy9ELE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7RUFDakM7Ozs7Ozs7OztDQVNELFNBQVMsWUFBWSxDQUFDLElBQUksRUFBRTtHQUMxQixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7R0FDeEIsR0FBRyxHQUFHLEtBQUssQ0FBQyxFQUFFO0tBQ1osR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNUO0dBQ0QsT0FBTyxHQUFHLENBQUM7RUFDWjs7Ozs7OztDQU9ELFNBQVMsTUFBTSxDQUFDLEdBQUcsRUFBRTtHQUNuQixJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUU7S0FDaEIsT0FBTyxNQUFNLENBQUM7SUFDZjs7R0FFRCxJQUFJLEdBQUcsS0FBSyxTQUFTLEVBQUU7S0FDckIsT0FBTyxXQUFXLENBQUM7SUFDcEI7O0dBRUQsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUU7S0FDM0IsT0FBTyxPQUFPLEdBQUcsQ0FBQztJQUNuQjs7R0FFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7S0FDdEIsT0FBTyxPQUFPLENBQUM7SUFDaEI7O0dBRUQsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7TUFDekIsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0VBQy9COzs7R0FJQyxJQUFJLE9BQU8sU0FBTSxLQUFLLFVBQVUsSUFBSSxTQUFNLENBQUMsR0FBRyxFQUFFO0tBQzlDLFNBQU0sQ0FBQyxZQUFZO09BQ2pCLE9BQU8sVUFBVSxDQUFDO01BQ25CLENBQUMsQ0FBQztJQUNKLE1BQU0sQUFBaUM7S0FDdEMsY0FBYyxHQUFHLFVBQVUsQ0FBQztJQUM3QixBQUVBO0VBQ0YsRUFBRSxjQUFJLENBQUMsQ0FBQzs7O0NDcE9UOzs7Ozs7Ozs7OztDQWFBLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztDQUNiLElBQUksS0FBSyxDQUFDOzs7Ozs7Q0FNVixnQkFBYyxHQUFHLE1BQU0sQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FvQnhCLFNBQVMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUU7R0FDeEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUU7S0FDM0IsTUFBTSxJQUFJLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQzFDOzs7R0FHRCxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUUsT0FBTyxHQUFHLENBQUM7R0FDMUIsSUFBSSxHQUFHLEtBQUssQ0FBQyxFQUFFLE9BQU8sR0FBRyxHQUFHLEdBQUcsQ0FBQzs7R0FFaEMsSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7R0FDM0IsSUFBSSxLQUFLLEtBQUssR0FBRyxJQUFJLE9BQU8sS0FBSyxLQUFLLFdBQVcsRUFBRTtLQUNqRCxLQUFLLEdBQUcsR0FBRyxDQUFDO0tBQ1osR0FBRyxHQUFHLEVBQUUsQ0FBQztJQUNWLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLEdBQUcsRUFBRTtLQUM1QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzNCOztHQUVELE9BQU8sR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRTtLQUNsQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEVBQUU7T0FDWCxHQUFHLElBQUksR0FBRyxDQUFDO01BQ1o7O0tBRUQsR0FBRyxLQUFLLENBQUMsQ0FBQztLQUNWLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDWjs7R0FFRCxHQUFHLElBQUksR0FBRyxDQUFDO0dBQ1gsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0dBQ3pCLE9BQU8sR0FBRyxDQUFDO0VBQ1o7O0NDMURELFdBQWMsR0FBRyxTQUFTLE9BQU8sQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRTtHQUM5QyxHQUFHLEdBQUcsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDOztHQUVyQixJQUFJLE9BQU8sR0FBRyxLQUFLLFdBQVcsRUFBRTtLQUM5QixPQUFPLEdBQUcsQ0FBQztJQUNaOztHQUVELElBQUksRUFBRSxLQUFLLENBQUMsRUFBRTtLQUNaLEVBQUUsR0FBRyxHQUFHLENBQUM7SUFDVixNQUFNLElBQUksRUFBRSxFQUFFO0tBQ2IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNwQixNQUFNO0tBQ0wsRUFBRSxHQUFHLEdBQUcsQ0FBQztJQUNWOztHQUVELE9BQU8sWUFBTSxDQUFDLEVBQUUsRUFBRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQztFQUMzQyxDQUFDOztDQ3RCRixJQUFNLG1CQUFPO0NBQ2IsSUFBSTtDQUNKLElBQUksY0FBYztLQUFFLFdBQVcsRUFBYjtLQUFpQixRQUFRLEVBQXpCO0tBQTZCLFFBQVE7O0NBUXZELElBQU0scUJBQXFCLENBQ3pCLFlBQ0EsYUFDQTtDQUdGLFNBQVMsT0FBUSxPQUFTLEVBQUEsTUFBVztnQ0FBWCxHQUFPOztLQUMvQixPQUFPLElBQUksT0FBSixXQUFhLE9BQVMsRUFBQSxRQUFWO1NBQ2pCLElBQUEsR0FBTyxZQUFBLENBQU8sSUFBSSxhQUFhO1NBQy9CLElBQU0sV0FBVyxlQUFBLENBQWdCLE1BQUEsQ0FBTyxNQUFQLENBQWMsSUFBSSxNQUFNO2FBQ3ZELFdBQVcsRUFENEM7YUFFdkQsT0FBTzs7U0FFVCxJQUFNLE9BQU8sT0FBQSxHQUFVLGdCQUFnQjtTQUN2QyxJQUFNLFNBQVMsWUFBQTtTQUNmLElBQUksTUFBQSxJQUFVLE1BQUEsQ0FBTyxNQUFqQixJQUEyQixPQUFPLE1BQUEsQ0FBTyxLQUFkLEtBQXdCLFlBQVk7YUFDakUsT0FBTyxNQUFBLENBQU8sS0FBUCxDQUFhLFlBQUEsQ0FBTyxJQUFJLE1BQU07MkJBQUU7Z0JBQWhDLENBQ0osSUFESSxXQUNDLGFBQU0sT0FBQSxDQUFRO2dCQUNqQjthQUNMLE9BQU8sT0FBQSxDQUFROzJCQUFFLFFBQUY7aUJBQVksUUFBUTs7Ozs7O0FBS3pDLENBQU8sU0FBUyxZQUFhLE1BQVc7Z0NBQVgsR0FBTzs7S0FDbEMsT0FBTyxNQUFBLENBQU8sTUFBTTs7O0FBR3RCLENBQU8sU0FBUyxVQUFXLE1BQVc7Z0NBQVgsR0FBTzs7S0FDaEMsT0FBTyxNQUFBLENBQU8sT0FBTzs7O0FBR3ZCLENBQU8sU0FBUyxhQUFjLE1BQVEsRUFBQSxLQUFVOzhCQUFWLEdBQU07O0tBQzFDLElBQU0sV0FBVyxHQUFBLENBQUksUUFBSixJQUFnQjtLQUNqQyxJQUFJLENBQUMsa0JBQUEsQ0FBbUIsUUFBbkIsQ0FBNEI7V0FBVyxNQUFNLElBQUksS0FBSiwrQkFBcUM7S0FDdkYsSUFBSSxhQUFhLFFBQUEsQ0FBUyxLQUFULENBQWUsSUFBZixDQUFvQixFQUFwQixJQUEwQixJQUFJLE9BQS9CLENBQXVDLFNBQVM7S0FDaEUsSUFBSTtXQUFXLFNBQUEsR0FBWSxPQUFJLFdBQVksV0FBaEI7S0FDM0IsT0FBTztvQkFDTCxTQURLO1NBRUwsTUFBTSxRQUZEO1NBR0wsU0FBUyxNQUFBLENBQU8sU0FBUCxDQUFpQixVQUFVLEdBQUEsQ0FBSTs7OztDQUk1QyxTQUFTLHNCQUF1QixTQUFTO0tBQ3ZDLE9BQU8sSUFBSSxPQUFKLFdBQWE7U0FDbEIsSUFBTSxhQUFhLE9BQUEsQ0FBUSxPQUFSLENBQWdCO1NBQ25DLElBQUksVUFBQSxLQUFlLENBQUMsR0FBRzthQUNyQixPQUFBLENBQVEsSUFBSSxNQUFBLENBQU8sSUFBWDthQUNSOztTQUVGLElBQU0sU0FBUyxPQUFBLENBQVEsS0FBUixDQUFjLFVBQUEsR0FBYTtTQUMxQyxJQUFNLGFBQWEsTUFBQSxDQUFPLElBQVAsQ0FBWTtTQUMvQixJQUFNLE9BQU8sT0FBQSxDQUFRLEtBQVIsQ0FBYyxHQUFHO1NBQzlCLElBQU0sWUFBWSxjQUFBLENBQWUsSUFBZixDQUFvQjtTQUN0QyxJQUFNLFFBQVEsU0FBQSxHQUFZLFNBQUEsQ0FBVSxLQUFLLE9BQU87U0FDaEQsSUFBTSxLQUFLLElBQUksV0FBSixDQUFnQixVQUFBLENBQVc7U0FDdEMsSUFBTSxLQUFLLElBQUksVUFBSixDQUFlO1NBQzFCLEtBQUssSUFBSSxJQUFJLEVBQUcsQ0FBQSxHQUFJLFVBQUEsQ0FBVyxRQUFRLENBQUEsSUFBSzthQUMxQyxFQUFBLENBQUcsRUFBSCxHQUFRLFVBQUEsQ0FBVyxVQUFYLENBQXNCOztTQUVoQyxPQUFBLENBQVEsSUFBSSxNQUFBLENBQU8sSUFBWCxDQUFnQixDQUFFLEtBQU07YUFBRSxNQUFNOzs7OztBQUk1QyxDQUFPLFNBQVMsWUFBYSxPQUFTLEVBQUEsTUFBVztnQ0FBWCxHQUFPOztLQUMzQyxPQUFPLHFCQUFBLENBQXNCLFFBQXRCLENBQ0osSUFESSxXQUNDLGVBQVEsUUFBQSxDQUFTLE1BQU07OztBQUdqQyxDQUFPLFNBQVMsU0FBVSxJQUFNLEVBQUEsTUFBVztnQ0FBWCxHQUFPOztLQUNyQyxPQUFPLElBQUksT0FBSixXQUFZO1NBQ2pCLElBQUEsR0FBTyxZQUFBLENBQU8sSUFBSSxhQUFhO1NBQy9CLElBQU0sV0FBVyxJQUFBLENBQUs7U0FFdEIsSUFBTSxTQUFTLFlBQUE7U0FDZixJQUFJLE1BQUEsSUFBVSxPQUFPLE1BQUEsQ0FBTyxRQUFkLEtBQTJCLFVBQXJDLElBQW1ELE1BQUEsQ0FBTyxRQUFRO2FBRXBFLE9BQU8sTUFBQSxDQUFPLFFBQVAsQ0FBZ0IsTUFBTSxZQUFBLENBQU8sSUFBSSxNQUFNOzJCQUFFO2dCQUF6QyxDQUNKLElBREksV0FDQyxhQUFNLE9BQUEsQ0FBUTtnQkFDakI7YUFFTCxJQUFJLENBQUMsTUFBTTtpQkFDVCxJQUFBLEdBQU8sUUFBQSxDQUFTLGFBQVQsQ0FBdUI7aUJBQzlCLElBQUEsQ0FBSyxLQUFMLENBQVcsVUFBWCxHQUF3QjtpQkFDeEIsSUFBQSxDQUFLLE1BQUwsR0FBYzs7YUFFaEIsSUFBQSxDQUFLLFFBQUwsR0FBZ0I7YUFDaEIsSUFBQSxDQUFLLElBQUwsR0FBWSxNQUFBLENBQU8sR0FBUCxDQUFXLGVBQVgsQ0FBMkI7YUFDdkMsUUFBQSxDQUFTLElBQVQsQ0FBYyxXQUFkLENBQTBCO2FBQzFCLElBQUEsQ0FBSyxPQUFMLGdCQUFlO2lCQUNiLElBQUEsQ0FBSyxPQUFMLEdBQWU7aUJBQ2YsVUFBQSxhQUFXO3FCQUNULE1BQUEsQ0FBTyxHQUFQLENBQVcsZUFBWCxDQUEyQjtxQkFDM0IsSUFBSSxJQUFBLENBQUs7MkJBQWUsSUFBQSxDQUFLLGFBQUwsQ0FBbUIsV0FBbkIsQ0FBK0I7cUJBQ3ZELElBQUEsQ0FBSyxlQUFMLENBQXFCO3FCQUNyQixPQUFBLENBQVE7bUNBQUUsUUFBRjt5QkFBWSxRQUFROzs7O2FBR2hDLElBQUEsQ0FBSyxLQUFMOzs7OztBQUtOLENBQU8sU0FBUyxTQUFVLElBQU0sRUFBQSxNQUFXO2dDQUFYLEdBQU87O0tBQ3JDLElBQU0sUUFBUSxLQUFBLENBQU0sT0FBTixDQUFjLEtBQWQsR0FBc0IsT0FBTyxDQUFFO0tBQzdDLElBQU0sT0FBTyxJQUFJLE1BQUEsQ0FBTyxJQUFYLENBQWdCLE9BQU87U0FBRSxNQUFNLElBQUEsQ0FBSyxJQUFMLElBQWE7O0tBQ3pELE9BQU8sUUFBQSxDQUFTLE1BQU07OztBQUd4QixDQUFPLFNBQVMsZUFBZ0I7S0FDOUIsSUFBTSxnQkFBZ0I7S0FDdEIsT0FBTyxVQUFBLENBQVcsSUFBSSxJQUFKLElBQVk7OztBQVNoQyxDQUFPLFNBQVMsZ0JBQWlCLEtBQVU7OEJBQVYsR0FBTTs7S0FDckMsR0FBQSxHQUFNLFlBQUEsQ0FBTyxJQUFJO0tBR2pCLElBQUksT0FBTyxHQUFBLENBQUksSUFBWCxLQUFvQixZQUFZO1NBQ2xDLE9BQU8sR0FBQSxDQUFJLElBQUosQ0FBUztZQUNYLElBQUksR0FBQSxDQUFJLE1BQU07U0FDbkIsT0FBTyxHQUFBLENBQUk7O0tBR2IsSUFBSSxRQUFRO0tBQ1osSUFBSSxZQUFZO0tBQ2hCLElBQUksT0FBTyxHQUFBLENBQUksU0FBWCxLQUF5QjtXQUFVLFNBQUEsR0FBWSxHQUFBLENBQUk7S0FFdkQsSUFBSSxPQUFPLEdBQUEsQ0FBSSxLQUFYLEtBQXFCLFVBQVU7U0FDakMsSUFBSTtTQUNKLElBQUksT0FBTyxHQUFBLENBQUksV0FBWCxLQUEyQixVQUFVO2FBQ3ZDLFdBQUEsR0FBYyxHQUFBLENBQUk7Z0JBQ2I7YUFDTCxXQUFBLEdBQWMsSUFBQSxDQUFLLEdBQUwsQ0FBUyxPQUFPLEdBQUEsQ0FBSTs7U0FFcEMsS0FBQSxHQUFRLE9BQUEsQ0FBUSxNQUFBLENBQU8sR0FBQSxDQUFJLFFBQVEsTUFBQSxDQUFPLFlBQVAsQ0FBb0IsUUFBUTs7S0FHakUsSUFBTSxXQUFXLFFBQUEsQ0FBUyxHQUFBLENBQUksWUFBYixJQUE2QixRQUFBLENBQVMsR0FBQSxDQUFJLE1BQTFDLElBQW9ELEdBQUEsQ0FBSSxXQUFKLEdBQWtCLENBQXRFLFVBQTZFLEdBQUEsQ0FBSSxVQUFVO0tBQzVHLElBQUksS0FBQSxJQUFTLE1BQU07U0FDakIsT0FBTyxDQUFFLFNBQVUsTUFBWixDQUFvQixNQUFwQixDQUEyQixRQUEzQixDQUFvQyxJQUFwQyxDQUF5QyxJQUF6QyxHQUFnRDtZQUNsRDtTQUNMLElBQU0sa0JBQWtCLEdBQUEsQ0FBSTtTQUM1QixPQUFPLENBQUUsR0FBQSxDQUFJLE9BQVEsR0FBQSxDQUFJLElBQUosSUFBWSxnQkFBaUIsU0FBVSxHQUFBLENBQUksS0FBTSxHQUFBLENBQUksT0FBbkUsQ0FBNEUsTUFBNUUsQ0FBbUYsUUFBbkYsQ0FBNEYsSUFBNUYsQ0FBaUcsSUFBakcsR0FBd0c7Ozs7Q0NwS25ILElBQU0sY0FBYztLQUNsQixXQUFXLFlBRE87S0FFbEIsVUFBVSxTQUZRO0tBR2xCLFdBQVcsU0FITztLQUlsQixNQUFNLE9BSlk7S0FLbEIsSUFBSSxJQUxjO0tBTWxCLFlBQVksV0FOTTtLQU9sQixTQUFTLE1BUFM7S0FRbEIsY0FBYzs7Q0FJaEIsSUFBTSxVQUFVLENBQ2QsYUFBYyxRQUFTLGdCQUFpQixjQUN4QztLQUFjLGNBQWUsUUFBUyxhQUN0QyxtQkFBb0IsZ0JBQWlCO0tBQ3JDLGVBQWdCLGNBQWUsU0FBVSxVQUFXLGFBQ3BELFNBQVU7S0FBUSxPQUFRLFNBQVUsU0FBVSxVQUFXLFVBQ3pELE9BQVEsV0FBWTtLQUFlLE1BQU8sZUFBZ0IsWUFDMUQsUUFBUyxPQUFRLFFBQVMsWUFBYTtLQUFXLEtBQU0sS0FDeEQsb0JBQXFCLE9BQVEsU0FBVSxXQUFZO0FBS3JELENBQU8sSUFBTSwwQkFBaUI7S0FDNUIsSUFBTSxPQUFPLE1BQUEsQ0FBTyxJQUFQLENBQVk7S0FDekIsSUFBQSxDQUFLLE9BQUwsV0FBYTtTQUNYLElBQUksR0FBQSxJQUFPLGFBQWE7YUFDdEIsSUFBTSxTQUFTLFdBQUEsQ0FBWTthQUMzQixPQUFBLENBQVEsSUFBUix5REFBaUUsOEJBQXVCO2dCQUNuRixJQUFJLENBQUMsT0FBQSxDQUFRLFFBQVIsQ0FBaUIsTUFBTTthQUNqQyxPQUFBLENBQVEsSUFBUix5REFBaUU7Ozs7O0NDL0J4RCw0QkFBVSxLQUFVOzhCQUFWLEdBQU07O0tBQzdCLElBQU0sb0JBQVU7U0FDZCxJQUFJLENBQUMsR0FBQSxDQUFJLE9BQUo7ZUFBZTtTQUVwQixJQUFNLFNBQVMsWUFBQTtTQUNmLElBQUksRUFBQSxDQUFHLE9BQUgsS0FBZSxFQUFmLElBQXFCLENBQUMsRUFBQSxDQUFHLE1BQXpCLEtBQW9DLEVBQUEsQ0FBRyxPQUFILElBQWMsRUFBQSxDQUFHLFVBQVU7YUFFakUsRUFBQSxDQUFHLGNBQUg7YUFDQSxHQUFBLENBQUksSUFBSixDQUFTO2dCQUNKLElBQUksRUFBQSxDQUFHLE9BQUgsS0FBZSxJQUFJO2FBRzVCLEdBQUEsQ0FBSSxVQUFKLENBQWU7Z0JBQ1YsSUFBSSxNQUFBLElBQVUsQ0FBQyxFQUFBLENBQUcsTUFBZCxJQUF3QixFQUFBLENBQUcsT0FBSCxLQUFlLEVBQXZDLEtBQThDLEVBQUEsQ0FBRyxPQUFILElBQWMsRUFBQSxDQUFHLFVBQVU7YUFFbEYsRUFBQSxDQUFHLGNBQUg7YUFDQSxHQUFBLENBQUksTUFBSixDQUFXOzs7S0FJZixJQUFNLHFCQUFTO1NBQ2IsTUFBQSxDQUFPLGdCQUFQLENBQXdCLFdBQVc7O0tBR3JDLElBQU0scUJBQVM7U0FDYixNQUFBLENBQU8sbUJBQVAsQ0FBMkIsV0FBVzs7S0FHeEMsT0FBTztpQkFDTCxNQURLO2lCQUVMOzs7O0NDaENKLElBQU0sZUFBZTtDQUVyQixJQUFNLE9BQU8sQ0FHWCxDQUFFLFdBQVksTUFBTyxPQUNyQixDQUFFLGVBQWdCLElBQUssS0FDdkIsQ0FBRSxTQUFVLElBQUs7S0FDakIsQ0FBRSxlQUFnQixJQUFLLEtBQ3ZCLENBQUUsZ0JBQWlCLEtBQU0sTUFHekIsQ0FBRSxLQUFNLEdBQUksSUFDWixDQUFFLEtBQU0sR0FBSTtLQUNaLENBQUUsS0FBTSxJQUFLLEtBQ2IsQ0FBRSxLQUFNLElBQUssS0FDYixDQUFFLEtBQU0sSUFBSyxLQUNiLENBQUUsS0FBTSxJQUFLLEtBQ2IsQ0FBRSxNQUFPLElBQUssS0FDZCxDQUFFO0tBQU8sSUFBSyxLQUNkLENBQUUsTUFBTyxJQUFLLEtBR2QsQ0FBRSxLQUFNLElBQUssTUFDYixDQUFFLEtBQU0sSUFBSyxLQUNiLENBQUUsS0FBTSxJQUFLLEtBQ2IsQ0FBRTtLQUFNLElBQUssS0FDYixDQUFFLEtBQU0sSUFBSyxLQUNiLENBQUUsS0FBTSxJQUFLLEtBQ2IsQ0FBRSxLQUFNLElBQUssS0FDYixDQUFFLEtBQU0sR0FBSSxLQUNaLENBQUUsS0FBTTtLQUFJLElBQ1osQ0FBRSxLQUFNLEdBQUksSUFDWixDQUFFLE1BQU8sR0FBSSxJQUNiLENBQUUsTUFBTyxLQUFNLE1BQ2YsQ0FBRSxNQUFPLEtBQU0sTUFDZixDQUFFLEtBQU07S0FBTSxNQUNkLENBQUUsS0FBTSxJQUFLLE1BQ2IsQ0FBRSxNQUFPLElBQUssTUFDZCxDQUFFLEtBQU0sSUFBSyxLQUNiLENBQUUsTUFBTyxJQUFLLEtBQ2QsQ0FBRSxLQUFNO0tBQUssS0FDYixDQUFFLEtBQU0sSUFBSyxLQUNiLENBQUUsS0FBTSxJQUFLLEtBQ2IsQ0FBRSxLQUFNLElBQUssS0FDYixDQUFFLEtBQU0sR0FBSSxLQUNaLENBQUUsS0FBTSxHQUFJO0tBQ1osQ0FBRSxLQUFNLEdBQUksSUFDWixDQUFFLE1BQU8sR0FBSSxJQUNiLENBQUUsTUFBTyxHQUFJLElBQ2IsQ0FBRSxNQUFPLEdBQUksSUFDYixDQUFFLEtBQU0sSUFBSyxNQUNiLENBQUU7S0FBTSxJQUFLLEtBQ2IsQ0FBRSxLQUFNLElBQUssS0FDYixDQUFFLEtBQU0sSUFBSyxLQUNiLENBQUUsS0FBTSxJQUFLLEtBQ2IsQ0FBRSxLQUFNLElBQUssS0FDYixDQUFFLEtBQU07S0FBSyxLQUNiLENBQUUsS0FBTSxHQUFJLEtBQ1osQ0FBRSxLQUFNLEdBQUksSUFDWixDQUFFLEtBQU0sR0FBSSxJQUNaLENBQUUsTUFBTyxHQUFJLElBQ2IsQ0FBRSxNQUFPLEdBQUksSUFDYixDQUFFO0tBQU8sR0FBSSxJQUliLENBQUUsY0FBZSxJQUFLLElBQUssTUFDM0IsQ0FBRSxTQUFVLElBQUssR0FBSSxNQUNyQixDQUFFLFFBQVMsSUFBSyxHQUFJO0tBQ3BCLENBQUUsZUFBZ0IsRUFBRyxFQUFHLE1BQ3hCLENBQUUsU0FBVSxHQUFJLEdBQUksTUFDcEIsQ0FBRSxVQUFXLEdBQUksR0FBSSxNQUNyQixDQUFFO0tBQVUsSUFBSyxLQUFNLE1BQ3ZCLENBQUUsU0FBVSxLQUFNLEtBQU0sTUFDeEIsQ0FBRSxTQUFVLEtBQU0sS0FBTSxNQUN4QixDQUFFO0tBQVUsS0FBTSxLQUFNLE1BQ3hCLENBQUUsU0FBVSxLQUFNLEtBQU0sTUFDeEIsQ0FBRSxTQUFVLEVBQUcsR0FBSSxNQUNuQixDQUFFLFNBQVUsR0FBSTtLQUFJLE1BQ3BCLENBQUUsU0FBVSxHQUFJLEdBQUksTUFDcEIsQ0FBRSxTQUFVLEdBQUksR0FBSSxNQUNwQixDQUFFLFNBQVUsR0FBSSxHQUFJLE1BQ3BCLENBQUU7S0FBVyxHQUFJLEdBQUksTUFDckIsQ0FBRSxVQUFXLEdBQUksR0FBSSxNQUNyQixDQUFFLFVBQVcsR0FBSSxHQUFJO0FBR3ZCLGtCQUFlLElBQUEsQ0FBSyxNQUFMLFdBQWEsSUFBTSxFQUFBLFFBQVA7S0FDekIsSUFBTSxPQUFPO1NBQ1gsT0FBTyxNQUFBLENBQU8sRUFBUCxJQUFhLFlBRFQ7U0FFWCxZQUFZLENBQUUsTUFBQSxDQUFPLEdBQUksTUFBQSxDQUFPOztLQUVsQyxJQUFBLENBQUssTUFBQSxDQUFPLEdBQVosR0FBa0I7S0FDbEIsSUFBQSxDQUFLLE1BQUEsQ0FBTyxFQUFQLENBQVUsT0FBVixDQUFrQixNQUFNLEtBQTdCLEdBQXFDO0tBQ3JDLE9BQU87SUFDTjs7Q0NoR0gsYUFBYyxHQUFHLFlBQVk7S0FDekIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7U0FDdkMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssU0FBUyxFQUFFLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQ3ZEO0VBQ0osQ0FBQzs7Q0NIRixJQUFJLEtBQUssR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQzs7Q0FFOUQsSUFBSSxXQUFXLEdBQUc7O0dBRWhCLENBQUMsRUFBRTtLQUNELE1BQU0sRUFBRSxRQUFRO0tBQ2hCLE1BQU0sRUFBRSxDQUFDO0lBQ1Y7R0FDRCxFQUFFLEVBQUU7S0FDRixNQUFNLEVBQUUsUUFBUTtLQUNoQixNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUc7SUFDaEI7R0FDRCxFQUFFLEVBQUU7S0FDRixNQUFNLEVBQUUsUUFBUTtLQUNoQixNQUFNLEVBQUUsQ0FBQyxHQUFHLElBQUk7SUFDakI7O0dBRUQsRUFBRSxFQUFFO0tBQ0YsTUFBTSxFQUFFLFVBQVU7S0FDbEIsTUFBTSxFQUFFLENBQUMsR0FBRyxFQUFFO0lBQ2Y7R0FDRCxFQUFFLEVBQUU7S0FDRixNQUFNLEVBQUUsVUFBVTtLQUNsQixNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUM7SUFDZDtHQUNELEVBQUUsRUFBRTtLQUNGLE1BQU0sRUFBRSxVQUFVO0tBQ2xCLE1BQU0sRUFBRSxDQUFDO0lBQ1Y7R0FDRCxFQUFFLEVBQUU7S0FDRixNQUFNLEVBQUUsVUFBVTtLQUNsQixNQUFNLEVBQUUsRUFBRTtJQUNYO0VBQ0YsQ0FBQzs7Q0FFRixNQUFNLE9BQU8sR0FBRztHQUNkLE1BQU0sRUFBRTtLQUNOLElBQUksRUFBRSxHQUFHO0tBQ1QsS0FBSyxFQUFFLENBQUMsR0FBRyxNQUFNO0lBQ2xCO0dBQ0QsUUFBUSxFQUFFO0tBQ1IsSUFBSSxFQUFFLElBQUk7S0FDVixLQUFLLEVBQUUsTUFBTTtJQUNkO0VBQ0YsQ0FBQzs7Q0FFRixTQUFTLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFO0dBQy9CLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsR0FBRyxRQUFRLENBQUMsR0FBRyxJQUFJLEdBQUcsUUFBUSxDQUFDLENBQUM7RUFDckU7O0NBRUQsU0FBUyxlQUFlLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0dBQ3ZELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztHQUNwRyxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQzs7R0FFNUUsSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7R0FDbEIsSUFBSSxhQUFhLEdBQUcsU0FBTyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7R0FDcEQsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztHQUMvQixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQzs7R0FFM0MsUUFBUSxHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztHQUNsQyxNQUFNLEdBQUcsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDOztHQUU5QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxRQUFRLEdBQUcscUJBQXFCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0dBQ2pJLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixHQUFHLE1BQU0sR0FBRyxxQkFBcUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7O0dBRTdILElBQUksUUFBUSxLQUFLLE1BQU0sRUFBRTs7S0FFdkIsT0FBTyxLQUFLLENBQUM7SUFDZDs7R0FFRCxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7R0FDakIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0dBQ25CLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQzs7R0FFdEIsSUFBSSxRQUFRLEtBQUssSUFBSSxFQUFFO0tBQ3JCLFVBQVUsR0FBRyxDQUFDLEdBQUcsYUFBYSxDQUFDO0tBQy9CLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDakI7R0FDRCxJQUFJLE1BQU0sS0FBSyxJQUFJLEVBQUU7S0FDbkIsU0FBUyxHQUFHLElBQUksQ0FBQztLQUNqQixRQUFRLEdBQUcsYUFBYSxDQUFDO0tBQ3pCLE1BQU0sR0FBRyxJQUFJLENBQUM7SUFDZjs7R0FFRCxJQUFJLFlBQVksR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7R0FDekMsSUFBSSxVQUFVLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDOzs7R0FHckMsSUFBSSxNQUFNLEdBQUcsS0FBSyxHQUFHLFlBQVksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDOzs7R0FHdEQsSUFBSSxZQUFZLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQyxNQUFNLEVBQUU7O0tBRTdDLE1BQU0sSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUM5Qzs7R0FFRCxJQUFJLE1BQU0sR0FBRyxNQUFNLEdBQUcsVUFBVSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUM7R0FDbkQsSUFBSSxTQUFTLElBQUksVUFBVSxFQUFFO0tBQzNCLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdCLE1BQU0sSUFBSSxPQUFPLFNBQVMsS0FBSyxRQUFRLElBQUksUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFO0tBQy9ELE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ25DO0dBQ0QsT0FBTyxNQUFNLENBQUM7RUFDZjs7Q0FFRCxpQkFBYyxHQUFHLGVBQWUsQ0FBQztDQUNqQyxXQUFvQixHQUFHLEtBQUssQ0FBQzs7O0NDeEd0QixTQUFTLHdCQUF5QixVQUFZLEVBQUEsT0FBZ0IsRUFBQSxlQUFvQjtzQ0FBcEMsR0FBVTtrREFBTSxHQUFnQjs7S0FDbkYsSUFBSSxPQUFPLFVBQVAsS0FBc0IsVUFBVTtTQUNsQyxJQUFNLE1BQU0sVUFBQSxDQUFXLFdBQVg7U0FDWixJQUFJLEVBQUUsR0FBQSxJQUFPLGFBQWE7YUFDeEIsTUFBTSxJQUFJLEtBQUosOEJBQW1DOztTQUUzQyxJQUFNLFNBQVMsVUFBQSxDQUFXO1NBQzFCLE9BQU8sTUFBQSxDQUFPLFVBQVAsQ0FBa0IsR0FBbEIsV0FBc0IsWUFDcEIsaUJBQUEsQ0FBZ0IsR0FBRyxNQUFBLENBQU8sT0FBTyxTQUFTO1lBRTlDO1NBQ0wsT0FBTzs7OztBQUlYLENBQU8sU0FBUyxrQkFBaUIsU0FBVyxFQUFBLFNBQWtCLEVBQUEsT0FBZ0IsRUFBQSxlQUFvQjswQ0FBdEQsR0FBWTtzQ0FBTSxHQUFVO2tEQUFNLEdBQWdCOztLQUM1RixPQUFPLGFBQUEsQ0FBYyxXQUFXLFdBQVcsU0FBUzt3QkFDbEQsYUFEa0Q7U0FFbEQsV0FBVyxDQUZ1QztTQUdsRCxZQUFZOzs7O0NDbkJoQixTQUFTLHFCQUFzQixVQUFVO0tBQ3ZDLElBQUksQ0FBQyxRQUFBLENBQVM7V0FBWSxPQUFPO0tBQ2pDLElBQUksT0FBTyxRQUFBLENBQVMsVUFBaEIsS0FBK0I7V0FBVSxPQUFPO0tBQ3BELElBQUksS0FBQSxDQUFNLE9BQU4sQ0FBYyxRQUFBLENBQVMsV0FBdkIsSUFBc0MsUUFBQSxDQUFTLFVBQVQsQ0FBb0IsTUFBcEIsSUFBOEI7V0FBRyxPQUFPO0tBQ2xGLE9BQU87OztDQUdULFNBQVMsY0FBZSxLQUFPLEVBQUEsVUFBVTtLQUV2QyxJQUFJLENBQUMsU0FBQSxJQUFhO1NBQ2hCLE9BQU8sQ0FBRSxJQUFLOztLQUdoQixJQUFJLFVBQVUsUUFBQSxDQUFTLE1BQVQsSUFBbUI7S0FFakMsSUFBSSxPQUFBLEtBQVksTUFBWixJQUNBLE9BQUEsS0FBWSxRQURaLElBRUEsT0FBQSxLQUFZLFFBQUEsQ0FBUyxNQUFNO1NBQzdCLE9BQU8sQ0FBRSxNQUFBLENBQU8sV0FBWSxNQUFBLENBQU87WUFDOUI7U0FDTCxVQUEwQixPQUFBLENBQVEscUJBQVI7U0FBbEI7U0FBTztTQUNmLE9BQU8sQ0FBRSxNQUFPOzs7O0FBSXBCLENBQWUsU0FBUyxhQUFjLEtBQU8sRUFBQSxVQUFVO0tBQ3JELElBQUksT0FBTztLQUNYLElBQUksWUFBWTtLQUNoQixJQUFJLGFBQWE7S0FFakIsSUFBTSxVQUFVLFNBQUE7S0FDaEIsSUFBTSxhQUFhLFFBQUEsQ0FBUztLQUM1QixJQUFNLGdCQUFnQixvQkFBQSxDQUFxQjtLQUMzQyxJQUFNLFlBQVksS0FBQSxDQUFNO0tBQ3hCLElBQUksYUFBYSxhQUFBLEdBQWdCLFFBQUEsQ0FBUyxVQUFULEtBQXdCLFFBQVE7S0FDakUsSUFBSSxjQUFlLENBQUMsU0FBRCxJQUFjLGFBQWYsR0FBZ0MsUUFBQSxDQUFTLGNBQWM7S0FFekUsSUFBSSxDQUFDO1dBQVMsVUFBQSxJQUFhLFdBQUEsR0FBYztLQUN6QyxJQUFNLFFBQVEsUUFBQSxDQUFTO0tBQ3ZCLElBQU0sZ0JBQWlCLE9BQU8sUUFBQSxDQUFTLGFBQWhCLEtBQWtDLFFBQWxDLElBQThDLFFBQUEsQ0FBUyxRQUFBLENBQVMsY0FBakUsR0FBbUYsUUFBQSxDQUFTLGdCQUFnQjtLQUNsSSxJQUFNLFFBQVEsT0FBQSxDQUFRLFFBQUEsQ0FBUyxPQUFPO0tBRXRDLElBQU0sbUJBQW1CLE9BQUEsR0FBVSxNQUFBLENBQU8sbUJBQW1CO0tBQzdELElBQU0saUJBQWlCLFdBQUEsR0FBYyxtQkFBbUI7S0FFeEQsSUFBSSxZQUFZO0tBTWhCLElBQUksT0FBTyxRQUFBLENBQVMsVUFBaEIsS0FBK0IsUUFBL0IsSUFBMkMsUUFBQSxDQUFTLFFBQUEsQ0FBUyxhQUFhO1NBRTVFLFVBQUEsR0FBYSxRQUFBLENBQVM7U0FDdEIsZ0JBQUEsR0FBbUIsT0FBQSxDQUFRLFFBQUEsQ0FBUyxrQkFBa0I7WUFDakQ7U0FDTCxJQUFJLGVBQWU7YUFFakIsVUFBQSxHQUFhO2FBR2IsZ0JBQUEsR0FBbUIsT0FBQSxDQUFRLFFBQUEsQ0FBUyxrQkFBa0I7Z0JBQ2pEO2FBRUwsVUFBQSxHQUFhO2FBRWIsZ0JBQUEsR0FBbUIsT0FBQSxDQUFRLFFBQUEsQ0FBUyxrQkFBa0I7OztLQUsxRCxJQUFJLE9BQU8sUUFBQSxDQUFTLGFBQWhCLEtBQWtDLFFBQWxDLElBQThDLFFBQUEsQ0FBUyxRQUFBLENBQVMsZ0JBQWdCO1NBQ2xGLFVBQUEsR0FBYSxJQUFBLENBQUssR0FBTCxDQUFTLFFBQUEsQ0FBUyxlQUFlOztLQUloRCxJQUFJLFdBQVc7U0FDYixVQUFBLEdBQWE7O0tBTWYsVUFBb0MsYUFBQSxDQUFjLE9BQU87S0FBbkQ7S0FBYTtLQUNuQixJQUFJLFdBQVc7S0FHZixJQUFJLGVBQWU7U0FDakIsSUFBTSxTQUFTLHVCQUFBLENBQXdCLFlBQVksT0FBTztTQUMxRCxJQUFNLFVBQVUsSUFBQSxDQUFLLEdBQUwsQ0FBUyxNQUFBLENBQU8sSUFBSSxNQUFBLENBQU87U0FDM0MsSUFBTSxTQUFTLElBQUEsQ0FBSyxHQUFMLENBQVMsTUFBQSxDQUFPLElBQUksTUFBQSxDQUFPO1NBQzFDLElBQUksUUFBQSxDQUFTLGFBQWE7YUFDeEIsSUFBTSxZQUFZLFFBQUEsQ0FBUyxXQUFULEtBQXlCO2FBQzNDLEtBQUEsR0FBUSxTQUFBLEdBQVksVUFBVTthQUM5QixNQUFBLEdBQVMsU0FBQSxHQUFZLFNBQVM7Z0JBQ3pCO2FBQ0wsS0FBQSxHQUFRLE1BQUEsQ0FBTzthQUNmLE1BQUEsR0FBUyxNQUFBLENBQU87O1NBR2xCLFNBQUEsR0FBWTtTQUNaLFVBQUEsR0FBYTtTQUdiLEtBQUEsSUFBUyxLQUFBLEdBQVE7U0FDakIsTUFBQSxJQUFVLEtBQUEsR0FBUTtZQUNiO1NBQ0wsS0FBQSxHQUFRO1NBQ1IsTUFBQSxHQUFTO1NBQ1QsU0FBQSxHQUFZO1NBQ1osVUFBQSxHQUFhOztLQUlmLElBQUksWUFBWTtLQUNoQixJQUFJLGFBQWE7S0FDakIsSUFBSSxhQUFBLElBQWlCLE9BQU87U0FFMUIsU0FBQSxHQUFZLGlCQUFBLENBQWdCLE9BQU8sT0FBTyxNQUFNO1NBQ2hELFVBQUEsR0FBYSxpQkFBQSxDQUFnQixRQUFRLE9BQU8sTUFBTTs7S0FJcEQsVUFBQSxHQUFhLElBQUEsQ0FBSyxLQUFMLENBQVc7S0FDeEIsV0FBQSxHQUFjLElBQUEsQ0FBSyxLQUFMLENBQVc7S0FHekIsSUFBSSxVQUFBLElBQWMsQ0FBQyxTQUFmLElBQTRCLGVBQWU7U0FDN0MsSUFBTSxTQUFTLEtBQUEsR0FBUTtTQUN2QixJQUFNLGVBQWUsV0FBQSxHQUFjO1NBQ25DLElBQU0sb0JBQW9CLE9BQUEsQ0FBUSxRQUFBLENBQVMsbUJBQW1CO1NBQzlELElBQU0sV0FBVyxJQUFBLENBQUssS0FBTCxDQUFXLFdBQUEsR0FBYyxpQkFBQSxHQUFvQjtTQUM5RCxJQUFNLFlBQVksSUFBQSxDQUFLLEtBQUwsQ0FBVyxZQUFBLEdBQWUsaUJBQUEsR0FBb0I7U0FDaEUsSUFBSSxVQUFBLEdBQWEsUUFBYixJQUF5QixXQUFBLEdBQWMsV0FBVzthQUNwRCxJQUFJLFlBQUEsR0FBZSxRQUFRO2lCQUN6QixXQUFBLEdBQWM7aUJBQ2QsVUFBQSxHQUFhLElBQUEsQ0FBSyxLQUFMLENBQVcsV0FBQSxHQUFjO29CQUNqQztpQkFDTCxVQUFBLEdBQWE7aUJBQ2IsV0FBQSxHQUFjLElBQUEsQ0FBSyxLQUFMLENBQVcsVUFBQSxHQUFhOzs7O0tBSzVDLFdBQUEsR0FBYyxXQUFBLEdBQWMsSUFBQSxDQUFLLEtBQUwsQ0FBVyxVQUFBLEdBQWEsY0FBYyxJQUFBLENBQUssS0FBTCxDQUFXLFVBQUEsR0FBYTtLQUMxRixZQUFBLEdBQWUsV0FBQSxHQUFjLElBQUEsQ0FBSyxLQUFMLENBQVcsVUFBQSxHQUFhLGVBQWUsSUFBQSxDQUFLLEtBQUwsQ0FBVyxVQUFBLEdBQWE7S0FFNUYsSUFBTSxnQkFBZ0IsV0FBQSxHQUFjLElBQUEsQ0FBSyxLQUFMLENBQVcsY0FBYyxJQUFBLENBQUssS0FBTCxDQUFXO0tBQ3hFLElBQU0saUJBQWlCLFdBQUEsR0FBYyxJQUFBLENBQUssS0FBTCxDQUFXLGVBQWUsSUFBQSxDQUFLLEtBQUwsQ0FBVztLQUUxRSxJQUFNLFNBQVMsV0FBQSxHQUFjO0tBQzdCLElBQU0sU0FBUyxZQUFBLEdBQWU7S0FHOUIsT0FBTztnQkFDTCxLQURLO3FCQUVMLFVBRks7Z0JBR0wsS0FISztpQkFJTCxNQUpLO1NBS0wsWUFBWSxDQUFFLE1BQU8sT0FMaEI7U0FNTCxPQUFPLEtBQUEsSUFBUyxJQU5YO2lCQU9MLE1BUEs7aUJBUUwsTUFSSzt3QkFTTCxhQVRLO3dCQVVMLGFBVks7eUJBV0wsY0FYSztzQkFZTCxXQVpLO3VCQWFMLFlBYks7b0JBY0wsU0FkSztxQkFlTCxVQWZLO3FCQWdCTCxVQWhCSztzQkFpQkw7Ozs7Q0M5S0osc0JBQWMsR0FBRyxpQkFBZ0I7Q0FDakMsU0FBUyxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO0dBQ3JDLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFO0tBQzVCLE1BQU0sSUFBSSxTQUFTLENBQUMsMEJBQTBCLENBQUM7SUFDaEQ7O0dBRUQsSUFBSSxHQUFHLElBQUksSUFBSSxHQUFFOztHQUVqQixJQUFJLE9BQU8sUUFBUSxLQUFLLFdBQVcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7S0FDbkQsT0FBTyxJQUFJO0lBQ1o7O0dBRUQsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBQztHQUM1RCxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUU7S0FDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBSztJQUMxQjtHQUNELElBQUksT0FBTyxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRTtLQUNuQyxNQUFNLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxPQUFNO0lBQzVCOztHQUVELElBQUksT0FBTyxHQUFHLEtBQUk7R0FDbEIsSUFBSSxHQUFFO0dBQ04sSUFBSTtLQUNGLElBQUksS0FBSyxHQUFHLEVBQUUsSUFBSSxHQUFFOztLQUVwQixJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO09BQy9CLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksRUFBQztNQUNuQzs7S0FFRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtPQUNyQyxFQUFFLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFDO09BQ3pDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRTtNQUNsQjtJQUNGLENBQUMsT0FBTyxDQUFDLEVBQUU7S0FDVixFQUFFLEdBQUcsS0FBSTtJQUNWO0dBQ0QsUUFBUSxFQUFFLElBQUksSUFBSSxDQUFDO0VBQ3BCOztDQ2pDRCxTQUFTLHNCQUF1QjtLQUM5QixJQUFJLENBQUMsU0FBQSxJQUFhO1NBQ2hCLE1BQU0sSUFBSSxLQUFKLENBQVU7O0tBRWxCLE9BQU8sUUFBQSxDQUFTLGFBQVQsQ0FBdUI7OztBQUdoQyxDQUFlLFNBQVMsYUFBYyxVQUFlO3dDQUFmLEdBQVc7O0tBQy9DLElBQUksU0FBUztLQUNiLElBQUksYUFBYTtLQUNqQixJQUFJLFFBQUEsQ0FBUyxNQUFULEtBQW9CLE9BQU87U0FFN0IsT0FBQSxHQUFVLFFBQUEsQ0FBUztTQUNuQixJQUFJLENBQUMsT0FBRCxJQUFZLE9BQU8sT0FBUCxLQUFtQixVQUFVO2FBQzNDLElBQUksWUFBWSxRQUFBLENBQVM7YUFDekIsSUFBSSxDQUFDLFdBQVc7aUJBQ2QsU0FBQSxHQUFZLG1CQUFBO2lCQUNaLFVBQUEsR0FBYTs7YUFFZixJQUFNLE9BQU8sT0FBQSxJQUFXO2FBQ3hCLElBQUksT0FBTyxTQUFBLENBQVUsVUFBakIsS0FBZ0MsWUFBWTtpQkFDOUMsTUFBTSxJQUFJLEtBQUosQ0FBVTs7YUFFbEIsT0FBQSxHQUFVLGtCQUFBLENBQWlCLE1BQU0sWUFBQSxDQUFPLElBQUksUUFBQSxDQUFTLFlBQVk7aUJBQUUsUUFBUTs7YUFDM0UsSUFBSSxDQUFDLFNBQVM7aUJBQ1osTUFBTSxJQUFJLEtBQUosb0NBQTBDOzs7U0FJcEQsTUFBQSxHQUFTLE9BQUEsQ0FBUTtTQUVqQixJQUFJLFFBQUEsQ0FBUyxNQUFULElBQW1CLE1BQUEsS0FBVyxRQUFBLENBQVMsUUFBUTthQUNqRCxNQUFNLElBQUksS0FBSixDQUFVOztTQUlsQixJQUFJLFFBQUEsQ0FBUyxXQUFXO2FBQ3RCLE9BQUEsQ0FBUSxxQkFBUixHQUFnQzthQUNoQyxPQUFBLENBQVEsd0JBQVIsR0FBbUM7YUFDbkMsT0FBQSxDQUFRLHNCQUFSLEdBQWlDO2FBQ2pDLE9BQUEsQ0FBUSwyQkFBUixHQUFzQzthQUN0QyxPQUFBLENBQVEsdUJBQVIsR0FBa0M7YUFDbEMsTUFBQSxDQUFPLEtBQVAsQ0FBYSxrQkFBYixHQUFrQzs7O0tBR3RDLE9BQU87aUJBQUUsTUFBRjtrQkFBVSxPQUFWO3FCQUFtQjs7OztDQzdCNUIsSUFBTSxnQkFDSix5QkFBZTs7O1NBQ2IsQ0FBSyxTQUFMLEdBQWlCO1NBQ2pCLENBQUssTUFBTCxHQUFjO1NBQ2QsQ0FBSyxPQUFMLEdBQWU7U0FDZixDQUFLLElBQUwsR0FBWTtTQUNaLENBQUssY0FBTCxHQUFzQjtTQUd0QixDQUFLLGlCQUFMLEdBQXlCO1NBQ3pCLENBQUssYUFBTCxHQUFxQjtTQUVyQixDQUFLLGtCQUFMLEdBQTBCLGlCQUFBLENBQWtCOzhCQUNqQyxTQUFNLE1BQUEsQ0FBSyxRQUFMLENBQWMsT0FBZCxLQUEwQixRQURDO3lCQUVuQztpQkFDRCxFQUFBLENBQUcsVUFBVTtxQkFDWCxNQUFBLENBQUssS0FBTCxDQUFXLFdBQVc7MkJBQ3hCLENBQUssU0FBTDsyQkFDQSxDQUFLLEdBQUw7O3VCQUNLLE1BQUEsQ0FBSyxNQUFMO29CQUNGLElBQUksQ0FBQyxNQUFBLENBQUssS0FBTCxDQUFXLFdBQVc7dUJBQ2hDLENBQUssV0FBTDs7VUFUc0M7aUNBWTlCO2lCQUNOLE1BQUEsQ0FBSyxLQUFMLENBQVc7bUJBQVMsTUFBQSxDQUFLLEtBQUw7O21CQUNuQixNQUFBLENBQUssSUFBTDtVQWRtQzsyQkFnQmpDO21CQUNQLENBQUssV0FBTCxDQUFpQjt5QkFBVTs7OztTQUkvQixDQUFLLGVBQUwsZ0JBQXVCLFNBQU0sTUFBQSxDQUFLLE9BQUw7U0FFN0IsQ0FBSyxjQUFMLGdCQUFzQjthQUNkLFVBQVUsTUFBQSxDQUFLLE1BQUw7YUFFWixTQUFTO21CQUNYLENBQUssTUFBTDs7Ozs7O29CQUtGLHlCQUFVO1lBQ0wsSUFBQSxDQUFLOztvQkFHViwyQkFBWTtZQUNQLElBQUEsQ0FBSzs7b0JBR1Ysd0JBQVM7WUFDSixJQUFBLENBQUs7O3lCQUdkLDhDQUFrQixXQUFhLEVBQUEsVUFBVTtTQUNqQyxjQUFjLE9BQU8sUUFBUCxLQUFvQixRQUFwQixJQUFnQyxRQUFBLENBQVM7WUFDdEQsV0FBQSxHQUFjLFdBQUEsR0FBYyxXQUFXOzt5QkFHaEQsd0NBQWUsUUFBVSxFQUFBLElBQU0sRUFBQSxXQUFhLEVBQUEsS0FBSztZQUN2QyxRQUFBLENBQVMsWUFBVCxJQUF5QixXQUFBLEdBQWMsQ0FBeEMsR0FDSCxJQUFBLENBQUssS0FBTCxDQUFXLFFBQUEsSUFBWSxXQUFBLEdBQWMsTUFDckMsSUFBQSxDQUFLLEtBQUwsQ0FBVyxHQUFBLEdBQU07O3lCQUd2Qix3REFBd0I7WUFDZixJQUFBLENBQUssYUFBTCxDQUNMLElBQUEsQ0FBSyxLQUFMLENBQVcsVUFBVSxJQUFBLENBQUssS0FBTCxDQUFXLE1BQ2hDLElBQUEsQ0FBSyxLQUFMLENBQVcsYUFBYSxJQUFBLENBQUssS0FBTCxDQUFXOzt5QkFJdkMsMENBQWlCO1NBQ1QsUUFBUSxJQUFBLENBQUs7WUFDWjtnQkFDRSxLQUFBLENBQU0sS0FEUjtpQkFFRyxLQUFBLENBQU0sTUFGVDtxQkFHTyxLQUFBLENBQU0sVUFIYjtzQkFJUSxLQUFBLENBQU0sV0FKZDt1QkFLUyxLQUFBLENBQU0sWUFMZjt3QkFNVSxLQUFBLENBQU0sYUFOaEI7eUJBT1csS0FBQSxDQUFNOzs7eUJBSTFCLHNCQUFPO1NBQ0QsQ0FBQyxJQUFBLENBQUs7V0FBUSxNQUFNLElBQUksS0FBSixDQUFVO1NBRzlCLElBQUEsQ0FBSyxRQUFMLENBQWMsT0FBZCxLQUEwQixPQUFPO2FBQ25DLENBQUssSUFBTDs7U0FJRSxPQUFPLElBQUEsQ0FBSyxNQUFMLENBQVksT0FBbkIsS0FBK0IsWUFBWTtnQkFDN0MsQ0FBUSxJQUFSLENBQWE7O1NBSVgsQ0FBQyxJQUFBLENBQUssS0FBTCxDQUFXLFNBQVM7YUFDdkIsQ0FBSyxZQUFMO2FBQ0EsQ0FBSyxLQUFMLENBQVcsT0FBWCxHQUFxQjs7U0FJdkIsQ0FBSyxJQUFMO1NBQ0EsQ0FBSyxNQUFMO1lBQ087O3lCQUdULDhDQUFtQjtTQUNiLElBQUEsQ0FBSyxJQUFMLElBQWEsSUFBYixJQUFxQixPQUFPLE1BQVAsS0FBa0IsV0FBdkMsSUFBc0QsT0FBTyxNQUFBLENBQU8sb0JBQWQsS0FBdUMsWUFBWTtlQUMzRyxDQUFPLG9CQUFQLENBQTRCLElBQUEsQ0FBSzthQUNqQyxDQUFLLElBQUwsR0FBWTs7U0FFVixJQUFBLENBQUssY0FBTCxJQUF1QixNQUFNO3FCQUMvQixDQUFhLElBQUEsQ0FBSzthQUNsQixDQUFLLGNBQUwsR0FBc0I7Ozt5QkFJMUIsd0JBQVE7U0FDRixVQUFVLElBQUEsQ0FBSyxRQUFMLENBQWM7U0FDeEIsV0FBQSxJQUFlLElBQUEsQ0FBSyxVQUFVO2dCQUNoQyxHQUFVO2dCQUNWLENBQVEsSUFBUixDQUFhOztTQUVYLENBQUM7V0FBUztTQUNWLENBQUMsU0FBQSxJQUFhO2dCQUNoQixDQUFRLEtBQVIsQ0FBYzs7O1NBR1osSUFBQSxDQUFLLEtBQUwsQ0FBVztXQUFTO1NBQ3BCLENBQUMsSUFBQSxDQUFLLEtBQUwsQ0FBVyxTQUFTO2FBQ3ZCLENBQUssWUFBTDthQUNBLENBQUssS0FBTCxDQUFXLE9BQVgsR0FBcUI7O1NBTXZCLENBQUssS0FBTCxDQUFXLE9BQVgsR0FBcUI7U0FDckIsQ0FBSyxlQUFMO1NBQ0EsQ0FBSyxTQUFMLEdBQWlCLE9BQUE7U0FDakIsQ0FBSyxJQUFMLEdBQVksTUFBQSxDQUFPLHFCQUFQLENBQTZCLElBQUEsQ0FBSzs7eUJBR2hELDBCQUFTO1NBQ0gsSUFBQSxDQUFLLEtBQUwsQ0FBVztXQUFXLElBQUEsQ0FBSyxTQUFMO1NBQzFCLENBQUssS0FBTCxDQUFXLE9BQVgsR0FBcUI7U0FFckIsQ0FBSyxlQUFMOzt5QkFHRixvQ0FBYztTQUNSLElBQUEsQ0FBSyxLQUFMLENBQVc7V0FBUyxJQUFBLENBQUssS0FBTDs7V0FDbkIsSUFBQSxDQUFLLElBQUw7O3lCQUlQLHdCQUFRO1NBQ04sQ0FBSyxLQUFMO1NBQ0EsQ0FBSyxLQUFMLENBQVcsS0FBWCxHQUFtQjtTQUNuQixDQUFLLEtBQUwsQ0FBVyxRQUFYLEdBQXNCO1NBQ3RCLENBQUssS0FBTCxDQUFXLElBQVgsR0FBa0I7U0FDbEIsQ0FBSyxLQUFMLENBQVcsU0FBWCxHQUF1QjtTQUN2QixDQUFLLEtBQUwsQ0FBVyxPQUFYLEdBQXFCO1NBQ3JCLENBQUssTUFBTDs7eUJBR0YsNEJBQVU7OztTQUNKLElBQUEsQ0FBSyxLQUFMLENBQVc7V0FBVztTQUN0QixDQUFDLFNBQUEsSUFBYTtnQkFDaEIsQ0FBUSxLQUFSLENBQWM7OztTQUloQixDQUFLLElBQUw7U0FDQSxDQUFLLEtBQUwsQ0FBVyxPQUFYLEdBQXFCO1NBQ3JCLENBQUssS0FBTCxDQUFXLFNBQVgsR0FBdUI7U0FFakIsYUFBYSxJQUFBLENBQUssb0JBQUwsQ0FBMEI7bUJBQVk7O1NBRW5ELGdCQUFnQixDQUFBLEdBQUksSUFBQSxDQUFLLEtBQUwsQ0FBVztTQUVyQyxDQUFLLGVBQUw7U0FDTSxtQkFBTzthQUNQLENBQUMsTUFBQSxDQUFLLEtBQUwsQ0FBVztlQUFXLE9BQU8sT0FBQSxDQUFRLE9BQVI7ZUFDbEMsQ0FBSyxLQUFMLENBQVcsU0FBWCxHQUF1QjtlQUN2QixDQUFLLElBQUw7Z0JBQ08sTUFBQSxDQUFLLFdBQUwsQ0FBaUIsV0FBakIsQ0FDSixJQURJLGFBQ0M7aUJBQ0EsQ0FBQyxNQUFBLENBQUssS0FBTCxDQUFXO21CQUFXO21CQUMzQixDQUFLLEtBQUwsQ0FBVyxTQUFYLEdBQXVCO21CQUN2QixDQUFLLEtBQUwsQ0FBVyxLQUFYO2lCQUNJLE1BQUEsQ0FBSyxLQUFMLENBQVcsS0FBWCxHQUFtQixNQUFBLENBQUssS0FBTCxDQUFXLGFBQWE7dUJBQzdDLENBQUssS0FBTCxDQUFXLElBQVgsSUFBbUI7dUJBQ25CLENBQUssS0FBTCxDQUFXLFFBQVgsR0FBc0IsTUFBQSxDQUFLLGdCQUFMLENBQXNCLE1BQUEsQ0FBSyxLQUFMLENBQVcsTUFBTSxNQUFBLENBQUssS0FBTCxDQUFXO3VCQUN4RSxDQUFLLGNBQUwsR0FBc0IsVUFBQSxDQUFXLE1BQU07b0JBQ2xDO3dCQUNMLENBQVEsR0FBUixDQUFZO3VCQUNaLENBQUssVUFBTDt1QkFDQSxDQUFLLFNBQUw7dUJBQ0EsQ0FBSyxJQUFMO3VCQUNBLENBQUssR0FBTDs7OztTQU1KLENBQUMsSUFBQSxDQUFLLEtBQUwsQ0FBVyxTQUFTO2FBQ3ZCLENBQUssWUFBTDthQUNBLENBQUssS0FBTCxDQUFXLE9BQVgsR0FBcUI7O1NBSW5CLElBQUEsQ0FBSyxNQUFMLElBQWUsT0FBTyxJQUFBLENBQUssTUFBTCxDQUFZLFdBQW5CLEtBQW1DLFlBQVk7YUFDaEUsQ0FBSyxpQkFBTCxXQUF1QixnQkFBUyxNQUFBLENBQUssTUFBTCxDQUFZLFdBQVosQ0FBd0I7O2dCQUkxRCxDQUFZLFdBQVosQ0FDRyxLQURILFdBQ1M7Z0JBQ0wsQ0FBUSxLQUFSLENBQWM7T0FGbEIsQ0FJRyxJQUpILFdBSVE7ZUFDSixDQUFLLElBQUwsR0FBWSxNQUFBLENBQU8scUJBQVAsQ0FBNkI7Ozt5QkFJL0Msd0NBQWdCOzs7U0FDVixJQUFBLENBQUssTUFBTCxJQUFlLE9BQU8sSUFBQSxDQUFLLE1BQUwsQ0FBWSxLQUFuQixLQUE2QixZQUFZO2FBQzFELENBQUssaUJBQUwsV0FBdUIsZ0JBQVMsTUFBQSxDQUFLLE1BQUwsQ0FBWSxLQUFaLENBQWtCOzs7eUJBSXRELG9DQUFjOzs7U0FDUixJQUFBLENBQUssTUFBTCxJQUFlLE9BQU8sSUFBQSxDQUFLLE1BQUwsQ0FBWSxHQUFuQixLQUEyQixZQUFZO2FBQ3hELENBQUssaUJBQUwsV0FBdUIsZ0JBQVMsTUFBQSxDQUFLLE1BQUwsQ0FBWSxHQUFaLENBQWdCOzs7eUJBSXBELGtDQUFhOzs7U0FDTCxlQUFlLElBQUEsQ0FBSyxLQUFMLENBQVc7U0FFaEMsQ0FBSyxlQUFMO1NBQ0EsQ0FBSyxLQUFMLENBQVcsU0FBWCxHQUF1QjtTQUN2QixDQUFLLEtBQUwsQ0FBVyxTQUFYLEdBQXVCO1NBQ3ZCLENBQUssS0FBTCxDQUFXLE9BQVgsR0FBcUI7WUFHZCxTQUFBLEVBQUEsQ0FDSixLQURJLFdBQ0U7Z0JBQ0wsQ0FBUSxLQUFSLENBQWM7T0FGWCxDQUlKLElBSkksYUFJQzthQUVBLFlBQUEsSUFBZ0IsTUFBQSxDQUFLLE1BQXJCLElBQStCLE9BQU8sTUFBQSxDQUFLLE1BQUwsQ0FBWSxTQUFuQixLQUFpQyxZQUFZO21CQUM5RSxDQUFLLGlCQUFMLFdBQXVCLGdCQUFTLE1BQUEsQ0FBSyxNQUFMLENBQVksU0FBWixDQUFzQjs7Ozt5QkFLOUQsc0RBQXNCLEtBQVU7a0NBQVYsR0FBTTs7WUFDbkI7bUJBQ0ssR0FBQSxDQUFJLFFBRFQ7ZUFFQyxHQUFBLENBQUksSUFGTDtjQUdBLElBQUEsQ0FBSyxLQUFMLENBQVcsR0FIWDtnQkFJRSxHQUFBLENBQUksUUFBSixHQUFlLElBQUEsQ0FBSyxLQUFMLENBQVcsUUFBUSxTQUpwQztlQUtDLElBQUEsQ0FBSyxRQUFMLENBQWMsSUFMZjtlQU1DLElBQUEsQ0FBSyxRQUFMLENBQWMsSUFOZjtpQkFPRyxJQUFBLENBQUssUUFBTCxDQUFjLE1BUGpCO2lCQVFHLElBQUEsQ0FBSyxRQUFMLENBQWMsTUFSakI7bUJBU0ssSUFBQSxDQUFLLFFBQUwsQ0FBYyxRQVRuQjswQkFVWSxJQUFBLENBQUssUUFBTCxDQUFjLGVBVjFCO29CQVdNLEdBQUEsQ0FBSSxTQUFKLElBQWlCLFlBQUEsRUFYdkI7c0JBWVEsUUFBQSxDQUFTLElBQUEsQ0FBSyxLQUFMLENBQVcsWUFBcEIsR0FBbUMsSUFBQSxDQUFLLEdBQUwsQ0FBUyxHQUFHLElBQUEsQ0FBSyxLQUFMLENBQVcsZUFBZTs7O3lCQUkxRixvQ0FBYSxLQUFVOztrQ0FBVixHQUFNOztTQUNiLENBQUMsSUFBQSxDQUFLO1dBQVEsT0FBTyxPQUFBLENBQVEsR0FBUixDQUFZO1NBQ2pDLE9BQU8sSUFBQSxDQUFLLE1BQUwsQ0FBWSxTQUFuQixLQUFpQyxZQUFZO2FBQy9DLENBQUssTUFBTCxDQUFZLFNBQVo7O1NBSUUsYUFBYSxJQUFBLENBQUssb0JBQUwsQ0FBMEI7U0FFckMsU0FBUyxZQUFBO1NBQ1gsSUFBSSxPQUFBLENBQVEsT0FBUjtTQUNKLE1BQUEsSUFBVSxHQUFBLENBQUksTUFBZCxJQUF3QixPQUFPLE1BQUEsQ0FBTyxNQUFkLEtBQXlCLFlBQVk7YUFDekQsYUFBYSxZQUFBLENBQU8sSUFBSTthQUN4QixPQUFPLE1BQUEsQ0FBTyxNQUFQLENBQWM7YUFDdkIsV0FBQSxDQUFVO2VBQU8sQ0FBQSxHQUFJOztlQUNwQixDQUFBLEdBQUksT0FBQSxDQUFRLE9BQVIsQ0FBZ0I7O1lBR3BCLENBQUEsQ0FBRSxJQUFGLFdBQU8sZUFDTCxNQUFBLENBQUssY0FBTCxDQUFvQixZQUFBLENBQU8sSUFBSSxZQUFZO2VBQVEsSUFBQSxJQUFRO1lBRDdELENBRUosSUFGSSxXQUVDO2FBR0YsTUFBQSxDQUFPLE1BQVAsS0FBa0I7ZUFBRyxPQUFPLE1BQUEsQ0FBTzs7ZUFDbEMsT0FBTzs7O3lCQUloQiwwQ0FBZ0IsWUFBaUI7O2dEQUFqQixHQUFhOztTQUMzQixDQUFLLE1BQUwsQ0FBWSxTQUFaLEdBQXdCO1NBR3hCLENBQUssTUFBTDtTQUdJLGFBQWEsSUFBQSxDQUFLLE1BQUw7U0FHWCxTQUFTLElBQUEsQ0FBSyxLQUFMLENBQVc7U0FHdEIsT0FBTyxVQUFQLEtBQXNCLGFBQWE7bUJBQ3JDLEdBQWEsQ0FBRTs7ZUFFakIsR0FBYSxFQUFBLENBQUcsTUFBSCxDQUFVLFdBQVYsQ0FBc0IsTUFBdEIsQ0FBNkI7ZUFJMUMsR0FBYSxVQUFBLENBQVcsR0FBWCxXQUFlO2FBQ3BCLGdCQUFnQixPQUFPLE1BQVAsS0FBa0IsUUFBbEIsSUFBOEIsTUFBOUIsS0FBeUMsTUFBQSxJQUFVLE1BQVYsSUFBb0IsU0FBQSxJQUFhO2FBQzFGLE9BQU8sYUFBQSxHQUFnQixNQUFBLENBQU8sT0FBTzthQUNyQyxPQUFPLGFBQUEsR0FBZ0IsWUFBQSxDQUFPLElBQUksUUFBUTttQkFBRTtjQUFVO21CQUFFOzthQUMxRCxRQUFBLENBQVMsT0FBTztpQkFDWixXQUFXLElBQUEsQ0FBSyxRQUFMLElBQWlCLFVBQUEsQ0FBVztpQkFDdkMsa0JBQWtCLE9BQUEsQ0FBUSxJQUFBLENBQUssaUJBQWlCLFVBQUEsQ0FBVyxpQkFBaUI7dUJBQzdDLFlBQUEsQ0FBYSxNQUFNOzJCQUFFLFFBQUY7a0NBQVk7O2lCQUE1RDtpQkFBUztpQkFBVztvQkFDckIsTUFBQSxDQUFPLE1BQVAsQ0FBYyxNQUFNOzBCQUFFLE9BQUY7NEJBQVcsU0FBWDt1QkFBc0I7O2dCQUM1QztvQkFDRTs7O1NBS1gsQ0FBSyxNQUFMLENBQVksU0FBWixHQUF3QjtTQUN4QixDQUFLLE1BQUw7U0FDQSxDQUFLLE1BQUw7WUFHTyxPQUFBLENBQVEsR0FBUixDQUFZLFVBQUEsQ0FBVyxHQUFYLFdBQWdCLE1BQVEsRUFBQSxDQUFHLEVBQUEsV0FBWjthQUUxQixTQUFTLFlBQUEsQ0FBTzt3QkFDVCxFQURTO3FCQUVaLEVBRlk7cUJBR1o7WUFDUCxZQUFZLFFBQVE7b0JBQ2QsQ0FEYzswQkFFUixTQUFBLENBQVU7O2FBS25CLFlBQVksVUFBQSxDQUFXLElBQVgsS0FBb0IsS0FBcEIsR0FBNEIsUUFBUSxNQUFBLENBQU87ZUFDN0QsQ0FBTyxJQUFQLEdBQWMsU0FBQSxLQUFjO2VBRzVCLENBQU8sUUFBUCxHQUFrQixlQUFBLENBQWdCO2dCQUczQixNQUFBLENBQU87Z0JBQ1AsTUFBQSxDQUFPO2NBR1QsSUFBSSxLQUFLLFFBQVE7aUJBQ2hCLE9BQU8sTUFBQSxDQUFPLEVBQWQsS0FBcUI7bUJBQWEsT0FBTyxNQUFBLENBQU87O2FBR2xELGNBQWMsT0FBQSxDQUFRLE9BQVIsQ0FBZ0I7YUFDOUIsTUFBQSxDQUFPLE1BQU07aUJBRVQsT0FBTyxNQUFBLENBQU87aUJBQ2hCLE1BQUEsQ0FBTyxTQUFTO3FCQUNaLFVBQVUsTUFBQSxDQUFPOzRCQUN2QixHQUFjLFdBQUEsQ0FBWSxTQUFTO29CQUM5Qjs0QkFDTCxHQUFjLFFBQUEsQ0FBUyxNQUFNOzs7Z0JBRzFCLFdBQUEsQ0FBWSxJQUFaLFdBQWlCLHFCQUNmLE1BQUEsQ0FBTyxNQUFQLENBQWMsSUFBSSxRQUFRO1FBeEM5QixDQTBDSCxJQTFDRyxXQTBDRTthQUNELGNBQWMsRUFBQSxDQUFHLE1BQUgsV0FBVSxZQUFLLENBQUEsQ0FBRTthQUNqQyxXQUFBLENBQVksTUFBWixHQUFxQixHQUFHO2lCQUVwQixrQkFBa0IsV0FBQSxDQUFZLElBQVosV0FBaUIsWUFBSyxDQUFBLENBQUU7aUJBQzFDLFdBQVcsV0FBQSxDQUFZLElBQVosV0FBaUIsWUFBSyxDQUFBLENBQUU7aUJBQ25DLGNBQWMsV0FBQSxDQUFZLElBQVosV0FBaUIsWUFBSyxDQUFBLENBQUU7aUJBQ3hDO2lCQUVBLFdBQUEsQ0FBWSxNQUFaLEdBQXFCO21CQUFHLElBQUEsR0FBTyxXQUFBLENBQVk7bUJBRTFDLElBQUk7bUJBQWlCLElBQUEsR0FBTyxDQUFHLGVBQUEsQ0FBZ0IscUJBQWMsV0FBQSxDQUFZLEVBQVosQ0FBZTs7bUJBRTVFLElBQUEsR0FBTyxNQUFHLFdBQUEsQ0FBWSxFQUFaLENBQWU7aUJBQzFCLFFBQVE7aUJBQ1IsVUFBQSxDQUFXLFVBQVU7cUJBQ2pCLGlCQUFpQixRQUFBLENBQVMsTUFBQSxDQUFLLEtBQUwsQ0FBVztzQkFDM0MsR0FBUSxjQUFBLGtCQUE0QixVQUFBLENBQVcsS0FBWCxHQUFtQixjQUFPLE1BQUEsQ0FBSyxLQUFMLENBQVcscUNBQTRCLFVBQUEsQ0FBVztvQkFDM0csSUFBSSxXQUFBLENBQVksTUFBWixHQUFxQixHQUFHO3NCQUNqQyxHQUFROztpQkFFSixTQUFTLFFBQUEsR0FBVyxzQkFBc0I7aUJBQzFDLFNBQVMsV0FBQSxHQUFjLG1CQUFtQjtvQkFDaEQsQ0FBUSxHQUFSLFVBQWtCLGtCQUFhLGlCQUFZLGNBQVMsUUFBUyxtQkFBbUIsbUJBQW1CLHNCQUFzQjs7YUFFdkgsT0FBTyxNQUFBLENBQUssTUFBTCxDQUFZLFVBQW5CLEtBQWtDLFlBQVk7bUJBQ2hELENBQUssTUFBTCxDQUFZLFVBQVo7O2dCQUVLOzs7eUJBSVgsZ0RBQW1CLElBQUk7U0FDckIsQ0FBSyxVQUFMO09BQ0EsQ0FBRyxJQUFBLENBQUs7U0FDUixDQUFLLFdBQUw7O3lCQUdGLG9DQUFjO1NBQ04sUUFBUSxJQUFBLENBQUs7U0FHZixDQUFDLElBQUEsQ0FBSyxLQUFMLENBQVcsRUFBWixJQUFrQixLQUFBLENBQU0sT0FBeEIsSUFBbUMsQ0FBQyxLQUFBLENBQU0sSUFBSTtjQUNoRCxDQUFNLE9BQU4sQ0FBYyxJQUFkO2FBQ0ksSUFBQSxDQUFLLFFBQUwsQ0FBYyxZQUFkLEtBQStCLE9BQU87a0JBQ3hDLENBQU0sT0FBTixDQUFjLEtBQWQsQ0FBb0IsS0FBQSxDQUFNLFFBQVEsS0FBQSxDQUFNOztZQUVyQyxJQUFJLEtBQUEsQ0FBTSxJQUFJO2NBQ25CLENBQU0sRUFBTixDQUFTLEtBQVQsQ0FBZSxLQUFBLENBQU0sTUFBTixHQUFlLEtBQUEsQ0FBTSxZQUFZLEtBQUEsQ0FBTSxNQUFOLEdBQWUsS0FBQSxDQUFNOzs7eUJBSXpFLHNDQUFlO1NBQ1AsUUFBUSxJQUFBLENBQUs7U0FFZixDQUFDLElBQUEsQ0FBSyxLQUFMLENBQVcsRUFBWixJQUFrQixLQUFBLENBQU0sT0FBeEIsSUFBbUMsQ0FBQyxLQUFBLENBQU0sSUFBSTtjQUNoRCxDQUFNLE9BQU4sQ0FBYyxPQUFkOztTQU9FLEtBQUEsQ0FBTSxFQUFOLElBQVksSUFBQSxDQUFLLFFBQUwsQ0FBYyxLQUFkLEtBQXdCLEtBQXBDLElBQTZDLENBQUMsS0FBQSxDQUFNLElBQUk7Y0FDMUQsQ0FBTSxFQUFOLENBQVMsS0FBVDs7O3lCQUlKLHdCQUFRO1NBQ0YsSUFBQSxDQUFLLE1BQUwsSUFBZSxPQUFPLElBQUEsQ0FBSyxNQUFMLENBQVksSUFBbkIsS0FBNEIsWUFBWTthQUN6RCxDQUFLLFVBQUw7YUFDQSxDQUFLLE1BQUwsQ0FBWSxJQUFaLENBQWlCLElBQUEsQ0FBSzthQUN0QixDQUFLLFdBQUw7Ozt5QkFJSiw0QkFBVTtTQUNKLElBQUEsQ0FBSyxLQUFMLENBQVcsSUFBSTthQUNqQixDQUFLLGlCQUFMLEdBQXlCO2FBQ3pCLENBQUssS0FBTCxDQUFXLEVBQVgsQ0FBYyxNQUFkO2dCQUNPLElBQUEsQ0FBSztZQUNQO2dCQUNFLElBQUEsQ0FBSyxjQUFMOzs7eUJBSVgsNENBQWtCO1NBQ1osQ0FBQyxJQUFBLENBQUs7V0FBUTtTQUVaLFFBQVEsSUFBQSxDQUFLO1NBQ25CLENBQUssVUFBTDtTQUVJO1NBRUEsT0FBTyxJQUFBLENBQUssTUFBWixLQUF1QixZQUFZO21CQUNyQyxHQUFhLElBQUEsQ0FBSyxNQUFMLENBQVk7WUFDcEIsSUFBSSxPQUFPLElBQUEsQ0FBSyxNQUFMLENBQVksTUFBbkIsS0FBOEIsWUFBWTttQkFDbkQsR0FBYSxJQUFBLENBQUssTUFBTCxDQUFZLE1BQVosQ0FBbUI7O1NBR2xDLENBQUssV0FBTDtZQUVPOzt5QkFHVCwwQkFBUSxLQUFVOztrQ0FBVixHQUFNOztTQUlOLGtCQUFrQixDQUN0QjtXQUdGLENBQU8sSUFBUCxDQUFZLElBQVosQ0FBaUIsT0FBakIsV0FBeUI7YUFDbkIsZUFBQSxDQUFnQixPQUFoQixDQUF3QixJQUF4QixJQUFnQyxHQUFHO21CQUMvQixJQUFJLEtBQUosb0JBQTBCOzs7U0FJOUIsWUFBWSxJQUFBLENBQUssU0FBTCxDQUFlO1NBQzNCLGFBQWEsSUFBQSxDQUFLLFNBQUwsQ0FBZTtVQUc3QixJQUFJLE9BQU8sS0FBSzthQUNiLFFBQVEsR0FBQSxDQUFJO2FBQ2QsT0FBTyxLQUFQLEtBQWlCLGFBQWE7bUJBQ2hDLENBQUssU0FBTCxDQUFlLElBQWYsR0FBc0I7OztTQUtwQixXQUFXLE1BQUEsQ0FBTyxNQUFQLENBQWMsSUFBSSxJQUFBLENBQUssV0FBVztTQUMvQyxNQUFBLElBQVUsR0FBVixJQUFpQixPQUFBLElBQVc7V0FBSyxNQUFNLElBQUksS0FBSixDQUFVO1dBQ2hELElBQUksTUFBQSxJQUFVO1dBQUssT0FBTyxRQUFBLENBQVM7V0FDbkMsSUFBSSxPQUFBLElBQVc7V0FBSyxPQUFPLFFBQUEsQ0FBUztTQUNyQyxVQUFBLElBQWMsR0FBZCxJQUFxQixhQUFBLElBQWlCO1dBQUssTUFBTSxJQUFJLEtBQUosQ0FBVTtXQUMxRCxJQUFJLFVBQUEsSUFBYztXQUFLLE9BQU8sUUFBQSxDQUFTO1dBQ3ZDLElBQUksYUFBQSxJQUFpQjtXQUFLLE9BQU8sUUFBQSxDQUFTO1NBRzNDLE1BQUEsSUFBVTtXQUFLLElBQUEsQ0FBSyxNQUFMLENBQVksSUFBWixHQUFtQixHQUFBLENBQUk7U0FFcEMsWUFBWSxJQUFBLENBQUssWUFBTCxDQUFrQjtXQUNwQyxDQUFPLE1BQVAsQ0FBYyxJQUFBLENBQUssUUFBUTtTQUd2QixTQUFBLEtBQWMsSUFBQSxDQUFLLFNBQUwsQ0FBZSxNQUE3QixJQUF1QyxVQUFBLEtBQWUsSUFBQSxDQUFLLFNBQUwsQ0FBZSxTQUFTO21CQUNwRCxZQUFBLENBQWEsSUFBQSxDQUFLO2FBQXRDO2FBQVE7YUFFaEIsQ0FBSyxLQUFMLENBQVcsTUFBWCxHQUFvQjthQUNwQixDQUFLLEtBQUwsQ0FBVyxPQUFYLEdBQXFCO2FBR3JCLENBQUssV0FBTDthQUdBLENBQUsscUJBQUw7O1NBSUUsR0FBQSxDQUFJLEVBQUosSUFBVSxPQUFPLEdBQUEsQ0FBSSxFQUFYLEtBQWtCLFlBQVk7YUFDMUMsQ0FBSyxLQUFMLENBQVcsRUFBWCxHQUFnQixHQUFBLENBQUk7YUFDcEIsQ0FBSyxLQUFMLENBQVcsRUFBWCxDQUFjLElBQWQsZ0JBQXFCO2lCQUNmLE1BQUEsQ0FBSzttQkFBZTttQkFDeEIsQ0FBSyxpQkFBTCxHQUF5QixNQUFBLENBQUssY0FBTDs7O1NBS3pCLFNBQUEsSUFBYSxLQUFLO2FBQ2hCLEdBQUEsQ0FBSTtlQUFTLElBQUEsQ0FBSyxJQUFMOztlQUNaLElBQUEsQ0FBSyxLQUFMOztrQkFHUCxDQUFjLElBQUEsQ0FBSztTQUduQixDQUFLLE1BQUw7U0FDQSxDQUFLLE1BQUw7WUFDTyxJQUFBLENBQUs7O3lCQUdkLDRCQUFVO1NBQ0YsV0FBVyxJQUFBLENBQUssYUFBTDtTQUVYLFdBQVcsSUFBQSxDQUFLO1NBQ2hCLFFBQVEsSUFBQSxDQUFLO1NBR2IsV0FBVyxZQUFBLENBQWEsT0FBTztXQUdyQyxDQUFPLE1BQVAsQ0FBYyxJQUFBLENBQUssUUFBUTtlQVN2QixJQUFBLENBQUs7U0FMUDtTQUNBO1NBQ0E7U0FDQTtTQUNBO1NBSUksU0FBUyxJQUFBLENBQUssS0FBTCxDQUFXO1NBQ3RCLE1BQUEsSUFBVSxRQUFBLENBQVMsWUFBVCxLQUEwQixPQUFPO2FBQ3pDLEtBQUEsQ0FBTSxJQUFJO2lCQUVSLE1BQUEsQ0FBTyxLQUFQLEtBQWlCLFdBQWpCLElBQWdDLE1BQUEsQ0FBTyxNQUFQLEtBQWtCLGNBQWM7cUJBQ2xFLENBQUssYUFBTCxHQUFxQjtzQkFFckIsQ0FBTSxFQUFOLENBQVMsWUFBVCxDQUFzQjtzQkFDdEIsQ0FBTSxFQUFOLENBQVMsWUFBVCxDQUFzQixXQUFBLEdBQWMsWUFBWSxZQUFBLEdBQWUsWUFBWTtxQkFDM0UsQ0FBSyxhQUFMLEdBQXFCOztnQkFFbEI7aUJBRUQsTUFBQSxDQUFPLEtBQVAsS0FBaUI7bUJBQWEsTUFBQSxDQUFPLEtBQVAsR0FBZTtpQkFDN0MsTUFBQSxDQUFPLE1BQVAsS0FBa0I7bUJBQWMsTUFBQSxDQUFPLE1BQVAsR0FBZ0I7O2FBR2xELFNBQUEsRUFBQSxJQUFlLFFBQUEsQ0FBUyxXQUFULEtBQXlCLE9BQU87bUJBQ2pELENBQU8sS0FBUCxDQUFhLEtBQWIsR0FBcUI7bUJBQ3JCLENBQU8sS0FBUCxDQUFhLE1BQWIsR0FBc0I7OztTQUlwQixXQUFXLElBQUEsQ0FBSyxhQUFMO1NBQ2IsVUFBVSxDQUFDLFdBQUEsQ0FBVSxVQUFVO1NBQy9CLFNBQVM7YUFDWCxDQUFLLFlBQUw7O1lBRUs7O3lCQUdULHdDQUFnQjtTQUVWLElBQUEsQ0FBSyxNQUFMLElBQWUsT0FBTyxJQUFBLENBQUssTUFBTCxDQUFZLE1BQW5CLEtBQThCLFlBQVk7YUFDM0QsQ0FBSyxNQUFMLENBQVksTUFBWixDQUFtQixJQUFBLENBQUs7Ozt5QkFJNUIsOEJBQVc7U0FDTCxDQUFDLElBQUEsQ0FBSyxLQUFMLENBQVc7V0FBUztTQUNyQixDQUFDLFNBQUEsSUFBYTtnQkFDaEIsQ0FBUSxLQUFSLENBQWM7OztTQUdoQixDQUFLLElBQUwsR0FBWSxNQUFBLENBQU8scUJBQVAsQ0FBNkIsSUFBQSxDQUFLO1NBRTFDLE1BQU0sT0FBQTtTQUVKLE1BQU0sSUFBQSxDQUFLLEtBQUwsQ0FBVztTQUNqQixrQkFBa0IsSUFBQSxHQUFPO1NBQzNCLGNBQWMsR0FBQSxHQUFNLElBQUEsQ0FBSztTQUV2QixXQUFXLElBQUEsQ0FBSyxLQUFMLENBQVc7U0FDdEIsY0FBYyxPQUFPLFFBQVAsS0FBb0IsUUFBcEIsSUFBZ0MsUUFBQSxDQUFTO1NBRXpELGFBQWE7U0FDWCxlQUFlLElBQUEsQ0FBSyxRQUFMLENBQWM7U0FDL0IsWUFBQSxLQUFpQixTQUFTO29CQUM1QixHQUFjO1lBQ1QsSUFBSSxZQUFBLEtBQWlCLFlBQVk7YUFDbEMsV0FBQSxHQUFjLGlCQUFpQjtnQkFDakMsR0FBTSxHQUFBLEdBQU8sV0FBQSxHQUFjO2lCQUMzQixDQUFLLFNBQUwsR0FBaUI7Z0JBQ1o7dUJBQ0wsR0FBYTs7WUFFVjthQUNMLENBQUssU0FBTCxHQUFpQjs7U0FHYixZQUFZLFdBQUEsR0FBYztTQUM1QixVQUFVLElBQUEsQ0FBSyxLQUFMLENBQVcsSUFBWCxHQUFrQixTQUFBLEdBQVksSUFBQSxDQUFLLEtBQUwsQ0FBVztTQUduRCxPQUFBLEdBQVUsQ0FBVixJQUFlLGFBQWE7Z0JBQzlCLEdBQVUsUUFBQSxHQUFXOztTQUluQixhQUFhO1NBQ2IsY0FBYztTQUVaLFVBQVUsSUFBQSxDQUFLLFFBQUwsQ0FBYyxJQUFkLEtBQXVCO1NBRW5DLFdBQUEsSUFBZSxPQUFBLElBQVcsVUFBVTthQUVsQyxTQUFTO3VCQUNYLEdBQWE7b0JBQ2IsR0FBVSxPQUFBLEdBQVU7d0JBQ3BCLEdBQWM7Z0JBQ1Q7dUJBQ0wsR0FBYTtvQkFDYixHQUFVO3VCQUNWLEdBQWE7O2FBR2YsQ0FBSyxVQUFMOztTQUdFLFlBQVk7YUFDZCxDQUFLLEtBQUwsQ0FBVyxTQUFYLEdBQXVCO2FBQ3ZCLENBQUssS0FBTCxDQUFXLElBQVgsR0FBa0I7YUFDbEIsQ0FBSyxLQUFMLENBQVcsUUFBWCxHQUFzQixJQUFBLENBQUssZ0JBQUwsQ0FBc0IsU0FBUzthQUMvQyxZQUFZLElBQUEsQ0FBSyxLQUFMLENBQVc7YUFDN0IsQ0FBSyxLQUFMLENBQVcsS0FBWCxHQUFtQixJQUFBLENBQUssb0JBQUw7YUFDZjtlQUFhLElBQUEsQ0FBSyxZQUFMO2FBQ2IsU0FBQSxLQUFjLElBQUEsQ0FBSyxLQUFMLENBQVc7ZUFBTyxJQUFBLENBQUssSUFBTDthQUNwQyxDQUFLLE1BQUw7YUFDQSxDQUFLLEtBQUwsQ0FBVyxTQUFYLEdBQXVCOztTQUdyQixZQUFZO2FBQ2QsQ0FBSyxLQUFMOzs7eUJBSUosOEJBQVUsSUFBSTtTQUNSLE9BQU8sRUFBUCxLQUFjO1dBQVksTUFBTSxJQUFJLEtBQUosQ0FBVTtPQUM5QyxDQUFHLElBQUEsQ0FBSztTQUNSLENBQUssTUFBTDs7eUJBR0YsMEJBQVM7U0FDUCxDQUFLLHFCQUFMOzt5QkFHRiw4QkFBVztTQUNMLFNBQUEsSUFBYTtlQUNmLENBQU8sbUJBQVAsQ0FBMkIsVUFBVSxJQUFBLENBQUs7YUFDMUMsQ0FBSyxrQkFBTCxDQUF3QixNQUF4Qjs7U0FFRSxJQUFBLENBQUssS0FBTCxDQUFXLE1BQVgsQ0FBa0IsZUFBZTthQUNuQyxDQUFLLEtBQUwsQ0FBVyxNQUFYLENBQWtCLGFBQWxCLENBQWdDLFdBQWhDLENBQTRDLElBQUEsQ0FBSyxLQUFMLENBQVc7Ozt5QkFJM0QsMERBQXlCO1NBQ25CLENBQUMsU0FBQTtXQUFhO1NBQ2QsSUFBQSxDQUFLLFFBQUwsQ0FBYyxNQUFkLEtBQXlCLEtBQXpCLEtBQW1DLElBQUEsQ0FBSyxLQUFMLENBQVcsTUFBWCxJQUFxQixDQUFDLElBQUEsQ0FBSyxLQUFMLENBQVcsTUFBWCxDQUFrQixnQkFBZ0I7YUFDdkYsZ0JBQWdCLElBQUEsQ0FBSyxRQUFMLENBQWMsTUFBZCxJQUF3QixRQUFBLENBQVM7c0JBQ3ZELENBQWMsV0FBZCxDQUEwQixJQUFBLENBQUssS0FBTCxDQUFXOzs7eUJBSXpDLHNDQUFlO1NBQ1QsSUFBQSxDQUFLLEtBQUwsQ0FBVyxTQUFTO2FBQ2xCLGNBQUEsQ0FBZSxJQUFBLENBQUssS0FBTCxDQUFXLFVBQVU7aUJBQ3RDLENBQUssTUFBTCxDQUFZLEVBQVosR0FBaUIsSUFBQSxDQUFLLEtBQUwsQ0FBVztnQkFDdkI7b0JBQ0UsSUFBQSxDQUFLLE1BQUwsQ0FBWTs7Ozt5QkFLekIsc0NBQWMsVUFBZTs0Q0FBZixHQUFXOztTQUVuQixXQUFXLFFBQUEsQ0FBUztTQUNwQixjQUFjLFFBQUEsQ0FBUztTQUNyQixZQUFZLE9BQUEsQ0FBUSxRQUFBLENBQVMsV0FBVztTQUN4QyxNQUFNLE9BQUEsQ0FBUSxRQUFBLENBQVMsS0FBSztTQUM1QixjQUFjLE9BQU8sUUFBUCxLQUFvQixRQUFwQixJQUFnQyxRQUFBLENBQVM7U0FDdkQsaUJBQWlCLE9BQU8sV0FBUCxLQUF1QixRQUF2QixJQUFtQyxRQUFBLENBQVM7U0FFN0QsMEJBQTBCLFdBQUEsR0FBYyxJQUFBLENBQUssS0FBTCxDQUFXLEdBQUEsR0FBTSxZQUFZO1NBQ3JFLDBCQUEwQixjQUFBLEdBQWtCLFdBQUEsR0FBYyxNQUFPO1NBQ25FLFdBQUEsSUFBZSxjQUFmLElBQWlDLHVCQUFBLEtBQTRCLGFBQWE7ZUFDdEUsSUFBSSxLQUFKLENBQVU7O1NBR2QsT0FBTyxRQUFBLENBQVMsVUFBaEIsS0FBK0IsV0FBL0IsSUFBOEMsT0FBTyxRQUFBLENBQVMsS0FBaEIsS0FBMEIsYUFBYTtnQkFDdkYsQ0FBUSxJQUFSLENBQWE7O2dCQUdmLEdBQWMsT0FBQSxDQUFRLGFBQWEseUJBQXlCO2FBQzVELEdBQVcsT0FBQSxDQUFRLFVBQVUseUJBQXlCO1NBRWhELFlBQVksUUFBQSxDQUFTO1NBQ3JCLGFBQWEsUUFBQSxDQUFTO1NBQ3RCLGVBQWUsT0FBTyxTQUFQLEtBQXFCLFFBQXJCLElBQWlDLFFBQUEsQ0FBUztTQUN6RCxnQkFBZ0IsT0FBTyxVQUFQLEtBQXNCLFFBQXRCLElBQWtDLFFBQUEsQ0FBUztTQUc3RCxPQUFPO1NBQ1AsUUFBUTtTQUNSLFdBQVc7U0FDWCxZQUFBLElBQWdCLGVBQWU7ZUFDM0IsSUFBSSxLQUFKLENBQVU7WUFDWCxJQUFJLGNBQWM7YUFFdkIsR0FBTztpQkFDUCxHQUFXLElBQUEsQ0FBSyxnQkFBTCxDQUFzQixNQUFNO2NBQ3ZDLEdBQVEsSUFBQSxDQUFLLGFBQUwsQ0FDTixVQUFVLE1BQ1YsYUFBYTtZQUVWLElBQUksZUFBZTtjQUV4QixHQUFRO2FBQ1IsR0FBTyxLQUFBLEdBQVE7aUJBQ2YsR0FBVyxJQUFBLENBQUssZ0JBQUwsQ0FBc0IsTUFBTTs7WUFHbEM7bUJBQ0wsUUFESztlQUVMLElBRks7Z0JBR0wsS0FISzttQkFJTCxRQUpLO3NCQUtMLFdBTEs7Y0FNTCxHQU5LO29CQU9MOzs7eUJBSUosd0JBQU8sVUFBZTs7NENBQWYsR0FBVzs7U0FDWixJQUFBLENBQUs7V0FBUSxNQUFNLElBQUksS0FBSixDQUFVO1NBRWpDLENBQUssU0FBTCxHQUFpQixNQUFBLENBQU8sTUFBUCxDQUFjLElBQUksVUFBVSxJQUFBLENBQUs7a0JBRWxELENBQWMsSUFBQSxDQUFLO2VBR1MsWUFBQSxDQUFhLElBQUEsQ0FBSztTQUF0QztTQUFTO1NBRVgsWUFBWSxJQUFBLENBQUssWUFBTCxDQUFrQixJQUFBLENBQUs7U0FHekMsQ0FBSyxNQUFMLEdBQWMsa0JBQ1QsU0FEUztrQkFFWixNQUZZO2tCQUdaLE9BSFk7b0JBSUQsQ0FKQztrQkFLSCxLQUxHO29CQU1ELEtBTkM7a0JBT0gsS0FQRztvQkFRRCxLQVJDO21CQVNGLElBQUEsQ0FBSyxRQVRIO2VBVU4sSUFBQSxDQUFLLFFBQUwsQ0FBYyxJQVZSOzZCQWFKLFNBQU0sTUFBQSxDQUFLLE1BQUwsS0FiRjtpQ0FjQSxTQUFNLE1BQUEsQ0FBSyxVQUFMLEtBZE47NkJBZUQsYUFBTyxNQUFBLENBQUssUUFBTCxDQUFjLE1BZnBCOzJCQWdCTixTQUFNLE1BQUEsQ0FBSyxJQUFMLEtBaEJBOzZCQWlCSixTQUFNLE1BQUEsQ0FBSyxNQUFMLEtBakJGOzJCQWtCSCxjQUFRLE1BQUEsQ0FBSyxNQUFMLENBQVksT0FsQmpCO2dDQW1CQyxjQUFPLE1BQUEsQ0FBSyxXQUFMLENBQWlCLE9BbkJ6Qjs2QkFvQkosU0FBTSxNQUFBLENBQUssTUFBTCxLQXBCRjsyQkFxQk4sU0FBTSxNQUFBLENBQUssSUFBTCxLQXJCQTs0QkFzQkwsU0FBTSxNQUFBLENBQUssS0FBTCxLQXRCRDsyQkF1Qk4sU0FBTSxNQUFBLENBQUssSUFBTDtTQUlkLENBQUssV0FBTDtTQUlBLENBQUssTUFBTDs7eUJBR0Ysa0NBQVksWUFBYyxFQUFBLGFBQWE7OztZQUM5QixJQUFBLENBQUssSUFBTCxDQUFVLGNBQWMsWUFBeEIsQ0FBcUMsSUFBckMsYUFBMEM7ZUFDL0MsQ0FBSyxHQUFMO2dCQUNPOzs7eUJBSVgsNEJBQVU7OztTQUNSLENBQUssS0FBTDtTQUNJLENBQUMsSUFBQSxDQUFLO1dBQVE7U0FDZCxPQUFPLElBQUEsQ0FBSyxNQUFMLENBQVksTUFBbkIsS0FBOEIsWUFBWTthQUM1QyxDQUFLLGlCQUFMLFdBQXVCLGdCQUFTLE1BQUEsQ0FBSyxNQUFMLENBQVksTUFBWixDQUFtQjs7U0FFckQsQ0FBSyxPQUFMLEdBQWU7O3lCQUdqQiw4QkFBVztTQUNULENBQUssTUFBTDtTQUNBLENBQUssT0FBTDs7eUJBR0Ysc0JBQU0sWUFBYyxFQUFBLGFBQWE7OztTQUUzQixPQUFPLFlBQVAsS0FBd0IsWUFBWTtlQUNoQyxJQUFJLEtBQUosQ0FBVTs7U0FHZCxJQUFBLENBQUssUUFBUTthQUNmLENBQUssTUFBTDs7U0FHRSxPQUFPLFdBQVAsS0FBdUIsYUFBYTthQUN0QyxDQUFLLE1BQUwsQ0FBWTs7U0FNZCxDQUFLLFVBQUw7U0FFSSxVQUFVLE9BQUEsQ0FBUSxPQUFSO1NBSVYsSUFBQSxDQUFLLFFBQUwsQ0FBYyxJQUFJO2FBQ2hCLENBQUMsU0FBQSxJQUFhO21CQUNWLElBQUksS0FBSixDQUFVOztnQkFFbEIsR0FBVSxJQUFJLE9BQUosV0FBWTtpQkFDaEIsZ0JBQWdCLE1BQUEsQ0FBSyxRQUFMLENBQWM7aUJBQzlCO2lCQUNBLGFBQUEsQ0FBYyxJQUFJO3dCQUNwQixHQUFVLGFBQUEsQ0FBYzs4QkFDeEIsR0FBZ0IsYUFBQSxDQUFjOztpQkFJMUIscUJBQVc7cUJBRVg7dUJBQVMsRUFBQSxDQUFHLE9BQUgsZ0JBQWEsU0FBTSxPQUFBLENBQVE7bUJBQ3hDLENBQUcsS0FBSCxnQkFBVzt5QkFDSCxRQUFRLE1BQUEsQ0FBSzt5QkFDYixPQUFPLE1BQUEsQ0FBSyxRQUFMLENBQWMsT0FBZCxLQUEwQjt5QkFDakMsV0FBVyxJQUFBLEdBQU8sRUFBQSxDQUFHLFFBQVEsRUFBQSxDQUFHO3VCQUN0QyxDQUFHLE1BQUg7dUJBQ0EsQ0FBRyxZQUFILENBQWdCLEtBQUEsQ0FBTTt1QkFDdEIsQ0FBRyxZQUFILENBQWdCLEtBQUEsQ0FBTSxlQUFlLEtBQUEsQ0FBTSxnQkFBZ0I7eUJBQ3ZELElBQUEsSUFBUSxNQUFBLENBQUssUUFBTCxDQUFjLFlBQVk7MkJBQ3BDLENBQUcsYUFBSCxDQUFpQixNQUFBLENBQUssUUFBTCxDQUFjOzsyQkFHakMsQ0FBSyxNQUFMLENBQVk7NkJBQUUsRUFBRjtpQ0FBYyxFQUFBLENBQUcsTUFBakI7a0NBQWtDLEVBQUEsQ0FBRyxTQUFILENBQWE7OzRCQUMzRDs7O2lCQUtBLE9BQU8sYUFBUCxLQUF5QixZQUFZO3FCQUNuQyxhQUFKLENBQWtCO29CQUNiO3FCQUNELE9BQU8sTUFBQSxDQUFPLFlBQWQsS0FBK0IsWUFBWTsyQkFDdkMsSUFBSSxLQUFKLENBQVU7O3lCQUVsQixDQUFTOzs7O1lBS1IsT0FBQSxDQUFRLElBQVIsYUFBYTthQUVkLFNBQVMsWUFBQSxDQUFhLE1BQUEsQ0FBSzthQUMzQixDQUFDLFdBQUEsQ0FBVSxTQUFTO21CQUN0QixHQUFTLE9BQUEsQ0FBUSxPQUFSLENBQWdCOztnQkFFcEI7T0FORixDQU9KLElBUEksV0FPQzthQUNGLENBQUM7ZUFBUSxNQUFBLEdBQVM7ZUFDdEIsQ0FBSyxPQUFMLEdBQWU7YUFHWCxTQUFBLElBQWE7bUJBQ2YsQ0FBSyxrQkFBTCxDQUF3QixNQUF4QjttQkFDQSxDQUFPLGdCQUFQLENBQXdCLFVBQVUsTUFBQSxDQUFLOztlQUd6QyxDQUFLLFdBQUw7ZUFNQSxDQUFLLFlBQUw7Z0JBQ087T0F4QkYsQ0F5QkosS0F6QkksV0F5QkU7Z0JBQ1AsQ0FBUSxJQUFSLENBQWEseUZBQUEsR0FBNEYsR0FBQSxDQUFJO2VBQ3ZHOzs7Ozs7Q0MzOUJaLElBQU0sUUFBUTtDQUNkLElBQU0sb0JBQW9CO0NBRTFCLFNBQVMsY0FBZTtLQUN0QixJQUFNLFNBQVMsWUFBQTtLQUNmLE9BQU8sTUFBQSxJQUFVLE1BQUEsQ0FBTzs7O0NBRzFCLFNBQVMsU0FBVSxJQUFJO0tBQ3JCLElBQU0sU0FBUyxZQUFBO0tBQ2YsSUFBSSxDQUFDO1dBQVEsT0FBTztLQUNwQixNQUFBLENBQU8sTUFBUCxHQUFnQixNQUFBLENBQU8sTUFBUCxJQUFpQjtLQUNqQyxPQUFPLE1BQUEsQ0FBTyxNQUFQLENBQWM7OztDQUd2QixTQUFTLFNBQVUsRUFBSSxFQUFBLE1BQU07S0FDM0IsSUFBTSxTQUFTLFlBQUE7S0FDZixJQUFJLENBQUM7V0FBUSxPQUFPO0tBQ3BCLE1BQUEsQ0FBTyxNQUFQLEdBQWdCLE1BQUEsQ0FBTyxNQUFQLElBQWlCO0tBQ2pDLE1BQUEsQ0FBTyxNQUFQLENBQWMsR0FBZCxHQUFvQjs7O0NBR3RCLFNBQVMsWUFBYSxVQUFZLEVBQUEsYUFBYTtLQUU3QyxPQUFPLFdBQUEsQ0FBWSxPQUFaLEdBQXNCO1NBQUUsTUFBTSxVQUFBLENBQVcsS0FBWCxDQUFpQjtTQUFTOzs7Q0FHakUsU0FBUyxhQUFjLE1BQVEsRUFBQSxVQUFlO3dDQUFmLEdBQVc7O0tBQ3hDLElBQUksUUFBQSxDQUFTLElBQUk7U0FDZixJQUFJLFFBQUEsQ0FBUyxNQUFULElBQW9CLFFBQUEsQ0FBUyxPQUFULElBQW9CLE9BQU8sUUFBQSxDQUFTLE9BQWhCLEtBQTRCLFVBQVc7YUFDakYsTUFBTSxJQUFJLEtBQUosQ0FBVTs7U0FJbEIsSUFBTSxVQUFVLE9BQU8sUUFBQSxDQUFTLE9BQWhCLEtBQTRCLFFBQTVCLEdBQXVDLFFBQUEsQ0FBUyxVQUFVO1NBQzFFLFFBQUEsR0FBVyxNQUFBLENBQU8sTUFBUCxDQUFjLElBQUksVUFBVTthQUFFLFFBQVEsS0FBVjtzQkFBaUI7OztLQUcxRCxJQUFNLFFBQVEsV0FBQTtLQUNkLElBQUk7S0FDSixJQUFJLE9BQU87U0FJVCxLQUFBLEdBQVEsT0FBQSxDQUFRLFFBQUEsQ0FBUyxJQUFJOztLQUUvQixJQUFJLGNBQWMsS0FBQSxJQUFTLE9BQU8sS0FBUCxLQUFpQjtLQUU1QyxJQUFJLFdBQUEsSUFBZSxpQkFBQSxDQUFrQixRQUFsQixDQUEyQixRQUFRO1NBQ3BELE9BQUEsQ0FBUSxJQUFSLENBQWEscUtBQXFLO1NBQ2xMLFdBQUEsR0FBYzs7S0FHaEIsSUFBSSxVQUFVLE9BQUEsQ0FBUSxPQUFSO0tBRWQsSUFBSSxhQUFhO1NBRWYsaUJBQUEsQ0FBa0IsSUFBbEIsQ0FBdUI7U0FFdkIsSUFBTSxlQUFlLFFBQUEsQ0FBUztTQUM5QixJQUFJLGNBQWM7YUFDaEIsSUFBTSxtQkFBTztpQkFFWCxJQUFNLFdBQVcsV0FBQSxDQUFZLFlBQUEsQ0FBYSxTQUFTO2lCQUVuRCxZQUFBLENBQWEsT0FBYixDQUFxQixPQUFyQjtpQkFFQSxPQUFPOzthQUlULE9BQUEsR0FBVSxZQUFBLENBQWEsSUFBYixDQUFrQixJQUFsQixDQUF1QixLQUF2QixDQUE2QixLQUE3QixDQUFtQzs7O0tBSWpELE9BQU8sT0FBQSxDQUFRLElBQVIsV0FBYTtTQUNsQixJQUFNLFVBQVUsSUFBSSxhQUFKO1NBQ2hCLElBQUk7U0FDSixJQUFJLFFBQVE7YUFFVixRQUFBLEdBQVcsTUFBQSxDQUFPLE1BQVAsQ0FBYyxJQUFJLFVBQVU7YUFHdkMsT0FBQSxDQUFRLEtBQVIsQ0FBYzthQUdkLE9BQUEsQ0FBUSxLQUFSO2FBR0EsTUFBQSxHQUFTLE9BQUEsQ0FBUSxVQUFSLENBQW1CO2dCQUN2QjthQUNMLE1BQUEsR0FBUyxPQUFBLENBQVEsT0FBUixDQUFnQjs7U0FFM0IsSUFBSSxhQUFhO2FBQ2YsUUFBQSxDQUFTLE9BQU87aUJBQUUsTUFBTSxNQUFSOzBCQUFnQjs7O1NBRWxDLE9BQU87Ozs7Q0FLWCxZQUFBLENBQWEsWUFBYixHQUE0QjtDQUM1QixZQUFBLENBQWEsVUFBYixHQUEwQjs7Ozs7Ozs7OztBQzFHMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN6ZEE7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gTWFyayBvdXRwdXQvZXhwb3J0IGFzIGVuYWJsZWQgZm9yIHRoZSBjbGllbnQgQVBJIHNjcmlwdHMuXG53aW5kb3dbJ2NhbnZhcy1za2V0Y2gtY2xpJ10gPSB3aW5kb3dbJ2NhbnZhcy1za2V0Y2gtY2xpJ10gfHwge307XG53aW5kb3dbJ2NhbnZhcy1za2V0Y2gtY2xpJ10ub3V0cHV0ID0gdHJ1ZTtcbiIsImNvbnN0IE5BTUVTUEFDRSA9ICdjYW52YXMtc2tldGNoLWNsaSc7XG5cbi8vIEdyYWIgdGhlIENMSSBuYW1lc3BhY2VcbndpbmRvd1tOQU1FU1BBQ0VdID0gd2luZG93W05BTUVTUEFDRV0gfHwge307XG5cbmlmICghd2luZG93W05BTUVTUEFDRV0uaW5pdGlhbGl6ZWQpIHtcbiAgaW5pdGlhbGl6ZSgpO1xufVxuXG5mdW5jdGlvbiBpbml0aWFsaXplICgpIHtcbiAgLy8gQXdhaXRpbmcgZW5hYmxlL2Rpc2FibGUgZXZlbnRcbiAgd2luZG93W05BTUVTUEFDRV0ubGl2ZVJlbG9hZEVuYWJsZWQgPSB1bmRlZmluZWQ7XG4gIHdpbmRvd1tOQU1FU1BBQ0VdLmluaXRpYWxpemVkID0gdHJ1ZTtcblxuICBjb25zdCBkZWZhdWx0UG9zdE9wdGlvbnMgPSB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgY2FjaGU6ICduby1jYWNoZScsXG4gICAgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbidcbiAgfTtcblxuICAvLyBGaWxlIHNhdmluZyB1dGlsaXR5XG4gIHdpbmRvd1tOQU1FU1BBQ0VdLnNhdmVCbG9iID0gKGJsb2IsIG9wdHMpID0+IHtcbiAgICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICAgIGNvbnN0IGZvcm0gPSBuZXcgd2luZG93LkZvcm1EYXRhKCk7XG4gICAgZm9ybS5hcHBlbmQoJ2ZpbGUnLCBibG9iLCBvcHRzLmZpbGVuYW1lKTtcbiAgICByZXR1cm4gd2luZG93LmZldGNoKCcvY2FudmFzLXNrZXRjaC1jbGkvc2F2ZUJsb2InLCBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0UG9zdE9wdGlvbnMsIHtcbiAgICAgIGJvZHk6IGZvcm1cbiAgICB9KSkudGhlbihyZXMgPT4ge1xuICAgICAgaWYgKHJlcy5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICByZXR1cm4gcmVzLmpzb24oKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiByZXMudGV4dCgpLnRoZW4odGV4dCA9PiB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRleHQpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgLy8gU29tZSBpc3N1ZSwganVzdCBiYWlsIG91dCBhbmQgcmV0dXJuIG5pbCBoYXNoXG4gICAgICBjb25zb2xlLndhcm4oYFRoZXJlIHdhcyBhIHByb2JsZW0gZXhwb3J0aW5nICR7b3B0cy5maWxlbmFtZX1gKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSk7XG4gIH07XG5cbiAgY29uc3Qgc3RyZWFtID0gKHVybCwgb3B0cykgPT4ge1xuICAgIG9wdHMgPSBvcHRzIHx8IHt9O1xuXG4gICAgcmV0dXJuIHdpbmRvdy5mZXRjaCh1cmwsIE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRQb3N0T3B0aW9ucywge1xuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzYXZlOiBvcHRzLnNhdmUsXG4gICAgICAgIGVuY29kaW5nOiBvcHRzLmVuY29kaW5nLFxuICAgICAgICB0aW1lU3RhbXA6IG9wdHMudGltZVN0YW1wLFxuICAgICAgICBmcHM6IG9wdHMuZnBzLFxuICAgICAgICBmaWxlbmFtZTogb3B0cy5maWxlbmFtZVxuICAgICAgfSlcbiAgICB9KSlcbiAgICAgIC50aGVuKHJlcyA9PiB7XG4gICAgICAgIGlmIChyZXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICByZXR1cm4gcmVzLmpzb24oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gcmVzLnRleHQoKS50aGVuKHRleHQgPT4ge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHRleHQpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAvLyBTb21lIGlzc3VlLCBqdXN0IGJhaWwgb3V0IGFuZCByZXR1cm4gbmlsIGhhc2hcbiAgICAgICAgY29uc29sZS53YXJuKGBUaGVyZSB3YXMgYSBwcm9ibGVtIHN0YXJ0aW5nIHRoZSBzdHJlYW0gZXhwb3J0YCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH0pO1xuICB9O1xuXG4gIC8vIEZpbGUgc3RyZWFtaW5nIHV0aWxpdHlcbiAgd2luZG93W05BTUVTUEFDRV0uc3RyZWFtU3RhcnQgPSAob3B0cykgPT4ge1xuICAgIHJldHVybiBzdHJlYW0oJy9jYW52YXMtc2tldGNoLWNsaS9zdHJlYW0tc3RhcnQnLCBvcHRzKTtcbiAgfTtcblxuICB3aW5kb3dbTkFNRVNQQUNFXS5zdHJlYW1FbmQgPSAob3B0cykgPT4ge1xuICAgIHJldHVybiBzdHJlYW0oJy9jYW52YXMtc2tldGNoLWNsaS9zdHJlYW0tZW5kJywgb3B0cyk7XG4gIH07XG5cbiAgLy8gZ2l0IGNvbW1pdCB1dGlsaXR5XG4gIHdpbmRvd1tOQU1FU1BBQ0VdLmNvbW1pdCA9ICgpID0+IHtcbiAgICByZXR1cm4gd2luZG93LmZldGNoKCcvY2FudmFzLXNrZXRjaC1jbGkvY29tbWl0JywgZGVmYXVsdFBvc3RPcHRpb25zKVxuICAgICAgLnRoZW4ocmVzcCA9PiByZXNwLmpzb24oKSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICBpZiAocmVzdWx0LmVycm9yLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ25vdCBhIGdpdCByZXBvc2l0b3J5JykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgV2FybmluZzogJHtyZXN1bHQuZXJyb3J9YCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHJlc3VsdC5lcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIE5vdGlmeSB1c2VyIG9mIGNoYW5nZXNcbiAgICAgICAgY29uc29sZS5sb2cocmVzdWx0LmNoYW5nZWRcbiAgICAgICAgICA/IGBbZ2l0XSAke3Jlc3VsdC5oYXNofSBDb21taXR0ZWQgY2hhbmdlc2BcbiAgICAgICAgICA6IGBbZ2l0XSAke3Jlc3VsdC5oYXNofSBOb3RoaW5nIGNoYW5nZWRgKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5oYXNoO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAvLyBTb21lIGlzc3VlLCBqdXN0IGJhaWwgb3V0IGFuZCByZXR1cm4gbmlsIGhhc2hcbiAgICAgICAgY29uc29sZS53YXJuKCdDb3VsZCBub3QgY29tbWl0IGNoYW5nZXMgYW5kIGZldGNoIGhhc2gnKTtcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfSk7XG4gIH07XG5cbiAgaWYgKCdidWRvLWxpdmVyZWxvYWQnIGluIHdpbmRvdykge1xuICAgIGNvbnN0IGNsaWVudCA9IHdpbmRvd1snYnVkby1saXZlcmVsb2FkJ107XG4gICAgY2xpZW50Lmxpc3RlbihkYXRhID0+IHtcbiAgICAgIGlmIChkYXRhLmV2ZW50ID09PSAnaG90LXJlbG9hZCcpIHtcbiAgICAgICAgc2V0dXBMaXZlUmVsb2FkKGRhdGEuZW5hYmxlZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBPbiBmaXJzdCBsb2FkLCBjaGVjayB0byBzZWUgaWYgd2Ugc2hvdWxkIHNldHVwIGxpdmUgcmVsb2FkIG9yIG5vdFxuICAgIGlmICh3aW5kb3dbTkFNRVNQQUNFXS5ob3QpIHtcbiAgICAgIHNldHVwTGl2ZVJlbG9hZCh0cnVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0dXBMaXZlUmVsb2FkKGZhbHNlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0dXBMaXZlUmVsb2FkIChpc0VuYWJsZWQpIHtcbiAgY29uc3QgcHJldmlvdXNTdGF0ZSA9IHdpbmRvd1tOQU1FU1BBQ0VdLmxpdmVSZWxvYWRFbmFibGVkO1xuICBpZiAodHlwZW9mIHByZXZpb3VzU3RhdGUgIT09ICd1bmRlZmluZWQnICYmIGlzRW5hYmxlZCAhPT0gcHJldmlvdXNTdGF0ZSkge1xuICAgIC8vIFdlIG5lZWQgdG8gcmVsb2FkIHRoZSBwYWdlIHRvIGVuc3VyZSB0aGUgbmV3IHNrZXRjaCBmdW5jdGlvbiBpc1xuICAgIC8vIG5hbWVkIGZvciBob3QgcmVsb2FkaW5nLCBhbmQvb3IgY2xlYW5lZCB1cCBhZnRlciBob3QgcmVsb2FkaW5nIGlzIGRpc2FibGVkXG4gICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCh0cnVlKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoaXNFbmFibGVkID09PSB3aW5kb3dbTkFNRVNQQUNFXS5saXZlUmVsb2FkRW5hYmxlZCkge1xuICAgIC8vIE5vIGNoYW5nZSBpbiBzdGF0ZVxuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIE1hcmsgbmV3IHN0YXRlXG4gIHdpbmRvd1tOQU1FU1BBQ0VdLmxpdmVSZWxvYWRFbmFibGVkID0gaXNFbmFibGVkO1xuXG4gIGlmIChpc0VuYWJsZWQpIHtcbiAgICBpZiAoJ2J1ZG8tbGl2ZXJlbG9hZCcgaW4gd2luZG93KSB7XG4gICAgICBjb25zb2xlLmxvZyhgJWNbY2FudmFzLXNrZXRjaC1jbGldJWMg4pyoIEhvdCBSZWxvYWQgRW5hYmxlZGAsICdjb2xvcjogIzhlOGU4ZTsnLCAnY29sb3I6IGluaXRpYWw7Jyk7XG4gICAgICBjb25zdCBjbGllbnQgPSB3aW5kb3dbJ2J1ZG8tbGl2ZXJlbG9hZCddO1xuICAgICAgY2xpZW50Lmxpc3RlbihvbkNsaWVudERhdGEpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkNsaWVudERhdGEgKGRhdGEpIHtcbiAgY29uc3QgY2xpZW50ID0gd2luZG93WydidWRvLWxpdmVyZWxvYWQnXTtcbiAgaWYgKCFjbGllbnQpIHJldHVybjtcblxuICBpZiAoZGF0YS5ldmVudCA9PT0gJ2V2YWwnKSB7XG4gICAgaWYgKCFkYXRhLmVycm9yKSB7XG4gICAgICBjbGllbnQuY2xlYXJFcnJvcigpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgZXZhbChkYXRhLmNvZGUpO1xuICAgICAgaWYgKCFkYXRhLmVycm9yKSBjb25zb2xlLmxvZyhgJWNbY2FudmFzLXNrZXRjaC1jbGldJWMg4pyoIEhvdCBSZWxvYWRlZGAsICdjb2xvcjogIzhlOGU4ZTsnLCAnY29sb3I6IGluaXRpYWw7Jyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGAlY1tjYW52YXMtc2tldGNoLWNsaV0lYyDwn5qoIEhvdCBSZWxvYWQgZXJyb3JgLCAnY29sb3I6ICM4ZThlOGU7JywgJ2NvbG9yOiBpbml0aWFsOycpO1xuICAgICAgY2xpZW50LnNob3dFcnJvcihlcnIudG9TdHJpbmcoKSk7XG5cbiAgICAgIC8vIFRoaXMgd2lsbCBhbHNvIGxvYWQgdXAgdGhlIHByb2JsZW1hdGljIHNjcmlwdCBzbyB0aGF0IHN0YWNrIHRyYWNlcyB3aXRoXG4gICAgICAvLyBzb3VyY2UgbWFwcyBpcyB2aXNpYmxlXG4gICAgICBjb25zdCBzY3JpcHRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgICBzY3JpcHRFbGVtZW50Lm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChzY3JpcHRFbGVtZW50KTtcbiAgICAgIH07XG4gICAgICBzY3JpcHRFbGVtZW50LnNyYyA9IGRhdGEuc3JjO1xuICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzY3JpcHRFbGVtZW50KTtcbiAgICB9XG4gIH1cbn0iLCIvKipcclxuICogQSBDYW52YXMyRCBleGFtcGxlIG9mIGEgcHJvY2VkdXJhbGx5IGFuaW1hdGVkICdzY3JpYmJsZScuXHJcbiAqIEBhdXRob3IgTWF0dCBEZXNMYXVyaWVycyAoQG1hdHRkZXNsKVxyXG4gKi9cclxuXHJcbmNvbnN0IGNhbnZhc1NrZXRjaCA9IHJlcXVpcmUoJ2NhbnZhcy1za2V0Y2gnKTtcclxuXHJcbmNvbnN0IFJhbmRvbSA9IHJlcXVpcmUoJ2NhbnZhcy1za2V0Y2gtdXRpbC9yYW5kb20nKTtcclxuY29uc3QgeyBjbGFtcCwgbGluc3BhY2UgfSA9IHJlcXVpcmUoJ2NhbnZhcy1za2V0Y2gtdXRpbC9tYXRoJyk7XHJcblxyXG4vLyBTZXR1cCBvdXIgc2tldGNoICYgZXhwb3J0IHBhcmFtZXRlcnNcclxuY29uc3Qgc2V0dGluZ3MgPSB7XHJcbiAgZGltZW5zaW9uczogWyAxMDI0LCAxMDI0IF0sXHJcbiAgYW5pbWF0ZTogdHJ1ZSxcclxuICBmcHM6IDI1LFxyXG4gIGR1cmF0aW9uOiAyMCxcclxuICBzY2FsZVRvVmlldzogdHJ1ZSxcclxuICBwbGF5YmFja1JhdGU6ICd0aHJvdHRsZSdcclxufTtcclxuXHJcbmNvbnN0IHNrZXRjaCA9ICh7IGNvbnRleHQsIHdpZHRoLCBoZWlnaHQsIHJlbmRlciB9KSA9PiB7XHJcbiAgLy8gUGFyYW1ldHJpYyBlcXVhdGlvbiBmb3IgYSAzRCB0b3J1c1xyXG4gIGNvbnN0IHRvcnVzID0gKGEsIGMsIHUsIHYsIG91dCA9IFtdKSA9PiB7XHJcbiAgICBvdXRbMF0gPSAoYyArIGEgKiBNYXRoLmNvcyh2KSkgKiBNYXRoLmNvcyh1KTtcclxuICAgIG91dFsxXSA9IChjICsgYSAqIE1hdGguY29zKHYpKSAqIE1hdGguc2luKHUpO1xyXG4gICAgb3V0WzJdID0gYSAqIE1hdGguc2luKHYpO1xyXG4gICAgcmV0dXJuIG91dDtcclxuICB9O1xyXG5cclxuICAvLyBHZW5lcmF0ZSBhIHNsaWNlIG9mIHRoZSBjdXJ2ZSBhdCB0aGV0YVxyXG4gIGNvbnN0IGdlbmVyYXRlID0gKHRoZXRhKSA9PiB7XHJcbiAgICAvLyBTaXplIG9mIHJlc3VsdGluZyBjdXJ2ZVxyXG4gICAgY29uc3QgYW1wbGl0dWRlID0gMC43O1xyXG5cclxuICAgIC8vIEhpZ2hlciBmcmVxdWVuY3kgbGVhZHMgdG8gbW9yZSBjaGFvdGljIGN1cnZlc1xyXG4gICAgY29uc3QgZnJlcSA9IDI7XHJcblxyXG4gICAgLy8gVXNlIGEgaGlnaCBudW1iZXIgdG8gZ2V0IHJlYWxseSBmaW5lIGxpbmVcclxuICAgIGNvbnN0IHJlc29sdXRpb24gPSA1MDAwO1xyXG5cclxuICAgIC8vIFNpemUgb2YgcGFyYW1ldHJpYyB0b3J1c1xyXG4gICAgY29uc3QgdG9ydXNSYWRpdXMgPSAwLjI1O1xyXG4gICAgY29uc3QgdG9ydXNJbm5lclJhZGl1cyA9IDEuNTtcclxuXHJcbiAgICAvLyBIb3cgZmFzdCB0byB3YWxrIGFyb3VuZCB0aGUgdG9ydXMgd2hpbGUgZHJhd2luZ1xyXG4gICAgY29uc3Qgcm90YXRpb24gPSB0aGV0YSAqIDU7XHJcblxyXG4gICAgLy8gSG93IG11Y2ggb2YgdGhlIGN1cnZlIHRvIGRyYXcgYXQgb25jZSAoMC4uMSlcclxuICAgIGNvbnN0IHNsaWNlU2l6ZSA9IDAuMTU7XHJcblxyXG4gICAgLy8gTWFrZSB0aGUgbG9vcCBsYXN0IGp1c3QgYSBiaXQgbG9uZ2VyXHJcbiAgICAvLyBzbyB0aGF0IHRoZSBjdXJ2ZSBmdWxseSBkaXNhcHBlYXJzIGludG8gdGhlIHZvaWRcclxuICAgIGNvbnN0IHRhaWxpbmdEdXJhdGlvbiA9IDEuMjtcclxuXHJcbiAgICAvLyBDcmVhdGUgdGhlIGZ1bGwgY3VydmVcclxuICAgIC8vIE5vdGU6IFRoaXMgaXMgYSBiaXQgaW5lZmZpY2llbnQhIFdlIGNvdWxkIGp1c3QgY29tcHV0ZSBvbmx5IHRoZSBzbGljZSB3ZSB3YW50LlxyXG4gICAgY29uc3QgYXJyYXkgPSBsaW5zcGFjZShyZXNvbHV0aW9uLCB0cnVlKS5tYXAodCA9PiB7XHJcbiAgICAgIGNvbnN0IGFuZ2xlID0gTWF0aC5QSSAqIDIgKiB0O1xyXG5cclxuICAgICAgLy8gR2V0IHBvaW50IGFsb25nIHRvcnVzXHJcbiAgICAgIGxldCBwb2ludCA9IHRvcnVzKHRvcnVzUmFkaXVzLCB0b3J1c0lubmVyUmFkaXVzLCBhbmdsZSwgcm90YXRpb24pO1xyXG5cclxuICAgICAgbGV0IFsgeCwgeSwgeiBdID0gcG9pbnQ7XHJcblxyXG4gICAgICAvLyBBcHBseSBub2lzZSBmcmVxdWVuY3kgdG8gY29vcmRpbmF0ZXNcclxuICAgICAgeCAqPSBmcmVxO1xyXG4gICAgICB5ICo9IGZyZXE7XHJcbiAgICAgIHogKj0gZnJlcTtcclxuXHJcbiAgICAgIC8vIENvbXB1dGUgbm9pc2UgY29vcmRpbmF0ZXNcclxuICAgICAgcmV0dXJuIFtcclxuICAgICAgICBhbXBsaXR1ZGUgKiBSYW5kb20ubm9pc2U0RCh4LCB5LCB6LCAtMSksXHJcbiAgICAgICAgYW1wbGl0dWRlICogUmFuZG9tLm5vaXNlNEQoeCwgeSwgeiwgMSlcclxuICAgICAgXTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdldCBqdXN0IGEgc2xpY2Ugb2YgdGhlIGN1cnZlXHJcbiAgICBjb25zdCBkcmF3TGVuZ3RoID0gTWF0aC5mbG9vcihyZXNvbHV0aW9uICogc2xpY2VTaXplKTtcclxuICAgIGNvbnN0IGRyYXcgPSB0aGV0YSAqIHJlc29sdXRpb24gKiB0YWlsaW5nRHVyYXRpb24gLSBkcmF3TGVuZ3RoIC8gMjtcclxuICAgIGNvbnN0IHN0YXJ0ID0gY2xhbXAoTWF0aC5mbG9vcihkcmF3IC0gZHJhd0xlbmd0aCAvIDIpLCAwLCByZXNvbHV0aW9uKTtcclxuICAgIGNvbnN0IGVuZCA9IGNsYW1wKE1hdGguZmxvb3IoZHJhdyArIGRyYXdMZW5ndGggLyAyKSwgMCwgcmVzb2x1dGlvbik7XHJcbiAgICByZXR1cm4gYXJyYXkuc2xpY2Uoc3RhcnQsIGVuZCk7XHJcbiAgfTtcclxuXHJcbiAgLy8gSW5pdGlhbCB2YWx1ZSBmb3Igc2xvd2x5IHJvdGF0aW9uIGh1ZVxyXG4gIGxldCBodWVTdGFydDtcclxuXHJcbiAgLy8gR2V0cyBuZXcgcmFuZG9tIG5vaXNlICYgaHVlXHJcbiAgY29uc3QgcmFuZG9taXplID0gKCkgPT4ge1xyXG4gICAgLy8gUmVzZXQgb3VyIHJhbmRvbSBub2lzZSBmdW5jdGlvbiB0byBhIG5ldyBzZWVkXHJcbiAgICBSYW5kb20uc2V0U2VlZChSYW5kb20uZ2V0UmFuZG9tU2VlZCgpKTtcclxuICAgIC8vIENob29zZSBhIG5ldyBzdGFydGluZyBodWVcclxuICAgIGh1ZVN0YXJ0ID0gUmFuZG9tLnZhbHVlKCk7XHJcbiAgICAvLyBMb2cgdGhlIHNlZWQgZm9yIGxhdGVyIHJlcHJvZHVjaWJpbGl0eVxyXG4gICAgY29uc29sZS5sb2coJ1NlZWQ6JywgUmFuZG9tLmdldFNlZWQoKSk7XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHJlbmRlcjogKHsgY29udGV4dCwgd2lkdGgsIGhlaWdodCwgcGxheWhlYWQgfSkgPT4ge1xyXG4gICAgICAvLyBDbGVhciB0aGUgYmFja2dyb3VuZCB3aXRoIG5lYXJseSBibGFja1xyXG4gICAgICBjb250ZXh0LmZpbGxTdHlsZSA9ICdoc2woMCwgMCUsIDUlKSc7XHJcbiAgICAgIGNvbnRleHQuZmlsbFJlY3QoMCwgMCwgd2lkdGgsIGhlaWdodCk7XHJcblxyXG4gICAgICBjb250ZXh0LnNhdmUoKTtcclxuXHJcbiAgICAgIC8vIEZpcnN0IHdlIHRyYW5zbGF0ZSBhbGwgdGhlIC0xLi4xIHBvaW50cyBpbnRvIDAuLnNjYWxlIHJhbmdlXHJcbiAgICAgIGNvbnN0IHNjYWxlID0gd2lkdGggLyAyO1xyXG4gICAgICBjb250ZXh0LnRyYW5zbGF0ZSh3aWR0aCAvIDIsIGhlaWdodCAvIDIpO1xyXG4gICAgICBjb250ZXh0LnNjYWxlKHNjYWxlLCBzY2FsZSk7XHJcblxyXG4gICAgICAvLyBDcmVhdGUgYSBIU0wgZnJvbSB0aGUgbG9vcCBwbGF5aGVhZFxyXG4gICAgICBjb25zdCBodWUgPSAocGxheWhlYWQgKyBodWVTdGFydCkgJSAxO1xyXG4gICAgICBjb25zdCBzYXQgPSAwLjc1O1xyXG4gICAgICBjb25zdCBsaWdodCA9IDAuNTtcclxuICAgICAgY29uc3QgaHNsID0gW1xyXG4gICAgICAgIE1hdGguZmxvb3IoaHVlICogMzYwKSxcclxuICAgICAgICBgJHtNYXRoLmZsb29yKDEwMCAqIHNhdCl9JWAsXHJcbiAgICAgICAgYCR7TWF0aC5mbG9vcigxMDAgKiBsaWdodCl9JWBcclxuICAgICAgXS5qb2luKCcsICcpO1xyXG4gICAgICBjb25zdCBzdHJva2UgPSBgaHNsKCR7aHNsfSlgO1xyXG5cclxuICAgICAgY29uc3QgbGluZSA9IGdlbmVyYXRlKHBsYXloZWFkKTtcclxuICAgICAgY29udGV4dC5saW5lV2lkdGggPSA2IC8gc2NhbGU7XHJcbiAgICAgIGNvbnRleHQubGluZUNhcCA9ICdyb3VuZCc7XHJcbiAgICAgIGNvbnRleHQubGluZUpvaW4gPSAncm91bmQnO1xyXG4gICAgICBjb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgICBsaW5lLmZvckVhY2gocG9pbnQgPT4ge1xyXG4gICAgICAgIGNvbnRleHQubGluZVRvKHBvaW50WzBdLCBwb2ludFsxXSk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBjb250ZXh0LnN0cm9rZVN0eWxlID0gc3Ryb2tlO1xyXG4gICAgICBjb250ZXh0LnN0cm9rZSgpO1xyXG5cclxuICAgICAgY29udGV4dC5yZXN0b3JlKCk7XHJcbiAgICB9LFxyXG4gICAgYmVnaW46ICgpID0+IHtcclxuICAgICAgLy8gT24gbG9vcCBzdGFydCwgcmUtY29tcHV0ZSB0aGUgbm9pc2UgdGFibGVzIHNvIHdlIGdldCBhIG5ld1xyXG4gICAgICAvLyBzZXQgb2YgcmFuZG9tIHZhbHVlcyBvbiB0aGUgbmV4dCBsb29wXHJcbiAgICAgIHJhbmRvbWl6ZSgpO1xyXG4gICAgfVxyXG4gIH07XHJcbn07XHJcblxyXG5jYW52YXNTa2V0Y2goc2tldGNoLCBzZXR0aW5ncyk7XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gd3JhcDtcbmZ1bmN0aW9uIHdyYXAgKHZhbHVlLCBmcm9tLCB0bykge1xuICBpZiAodHlwZW9mIGZyb20gIT09ICdudW1iZXInIHx8IHR5cGVvZiB0byAhPT0gJ251bWJlcicpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdNdXN0IHNwZWNpZnkgXCJ0b1wiIGFuZCBcImZyb21cIiBhcmd1bWVudHMgYXMgbnVtYmVycycpO1xuICB9XG4gIC8vIGFsZ29yaXRobSBmcm9tIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzU4NTI2MjgvNTk5ODg0XG4gIGlmIChmcm9tID4gdG8pIHtcbiAgICB2YXIgdCA9IGZyb207XG4gICAgZnJvbSA9IHRvO1xuICAgIHRvID0gdDtcbiAgfVxuICB2YXIgY3ljbGUgPSB0byAtIGZyb207XG4gIGlmIChjeWNsZSA9PT0gMCkge1xuICAgIHJldHVybiB0bztcbiAgfVxuICByZXR1cm4gdmFsdWUgLSBjeWNsZSAqIE1hdGguZmxvb3IoKHZhbHVlIC0gZnJvbSkgLyBjeWNsZSk7XG59XG4iLCJ2YXIgZGVmaW5lZCA9IHJlcXVpcmUoJ2RlZmluZWQnKTtcbnZhciB3cmFwID0gcmVxdWlyZSgnLi9saWIvd3JhcCcpO1xudmFyIEVQU0lMT04gPSBOdW1iZXIuRVBTSUxPTjtcblxuZnVuY3Rpb24gY2xhbXAgKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gbWluIDwgbWF4XG4gICAgPyAodmFsdWUgPCBtaW4gPyBtaW4gOiB2YWx1ZSA+IG1heCA/IG1heCA6IHZhbHVlKVxuICAgIDogKHZhbHVlIDwgbWF4ID8gbWF4IDogdmFsdWUgPiBtaW4gPyBtaW4gOiB2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGNsYW1wMDEgKHYpIHtcbiAgcmV0dXJuIGNsYW1wKHYsIDAsIDEpO1xufVxuXG5mdW5jdGlvbiBsZXJwIChtaW4sIG1heCwgdCkge1xuICByZXR1cm4gbWluICogKDEgLSB0KSArIG1heCAqIHQ7XG59XG5cbmZ1bmN0aW9uIGludmVyc2VMZXJwIChtaW4sIG1heCwgdCkge1xuICBpZiAoTWF0aC5hYnMobWluIC0gbWF4KSA8IEVQU0lMT04pIHJldHVybiAwO1xuICBlbHNlIHJldHVybiAodCAtIG1pbikgLyAobWF4IC0gbWluKTtcbn1cblxuZnVuY3Rpb24gc21vb3Roc3RlcCAobWluLCBtYXgsIHQpIHtcbiAgdmFyIHggPSBjbGFtcChpbnZlcnNlTGVycChtaW4sIG1heCwgdCksIDAsIDEpO1xuICByZXR1cm4geCAqIHggKiAoMyAtIDIgKiB4KTtcbn1cblxuZnVuY3Rpb24gdG9GaW5pdGUgKG4sIGRlZmF1bHRWYWx1ZSkge1xuICBkZWZhdWx0VmFsdWUgPSBkZWZpbmVkKGRlZmF1bHRWYWx1ZSwgMCk7XG4gIHJldHVybiB0eXBlb2YgbiA9PT0gJ251bWJlcicgJiYgaXNGaW5pdGUobikgPyBuIDogZGVmYXVsdFZhbHVlO1xufVxuXG5mdW5jdGlvbiBleHBhbmRWZWN0b3IgKGRpbXMpIHtcbiAgaWYgKHR5cGVvZiBkaW1zICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgZGltcyBhcmd1bWVudCcpO1xuICByZXR1cm4gZnVuY3Rpb24gKHAsIGRlZmF1bHRWYWx1ZSkge1xuICAgIGRlZmF1bHRWYWx1ZSA9IGRlZmluZWQoZGVmYXVsdFZhbHVlLCAwKTtcbiAgICB2YXIgc2NhbGFyO1xuICAgIGlmIChwID09IG51bGwpIHtcbiAgICAgIC8vIE5vIHZlY3RvciwgY3JlYXRlIGEgZGVmYXVsdCBvbmVcbiAgICAgIHNjYWxhciA9IGRlZmF1bHRWYWx1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwID09PSAnbnVtYmVyJyAmJiBpc0Zpbml0ZShwKSkge1xuICAgICAgLy8gRXhwYW5kIHNpbmdsZSBjaGFubmVsIHRvIG11bHRpcGxlIHZlY3RvclxuICAgICAgc2NhbGFyID0gcDtcbiAgICB9XG5cbiAgICB2YXIgb3V0ID0gW107XG4gICAgdmFyIGk7XG4gICAgaWYgKHNjYWxhciA9PSBudWxsKSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgZGltczsgaSsrKSB7XG4gICAgICAgIG91dFtpXSA9IHRvRmluaXRlKHBbaV0sIGRlZmF1bHRWYWx1ZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBkaW1zOyBpKyspIHtcbiAgICAgICAgb3V0W2ldID0gc2NhbGFyO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0O1xuICB9O1xufVxuXG5mdW5jdGlvbiBsZXJwQXJyYXkgKG1pbiwgbWF4LCB0LCBvdXQpIHtcbiAgb3V0ID0gb3V0IHx8IFtdO1xuICBpZiAobWluLmxlbmd0aCAhPT0gbWF4Lmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ21pbiBhbmQgbWF4IGFycmF5IGFyZSBleHBlY3RlZCB0byBoYXZlIHRoZSBzYW1lIGxlbmd0aCcpO1xuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbWluLmxlbmd0aDsgaSsrKSB7XG4gICAgb3V0W2ldID0gbGVycChtaW5baV0sIG1heFtpXSwgdCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gbmV3QXJyYXkgKG4sIGluaXRpYWxWYWx1ZSkge1xuICBuID0gZGVmaW5lZChuLCAwKTtcbiAgaWYgKHR5cGVvZiBuICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgbiBhcmd1bWVudCB0byBiZSBhIG51bWJlcicpO1xuICB2YXIgb3V0ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBvdXQucHVzaChpbml0aWFsVmFsdWUpO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBsaW5zcGFjZSAobiwgb3B0cykge1xuICBuID0gZGVmaW5lZChuLCAwKTtcbiAgaWYgKHR5cGVvZiBuICE9PSAnbnVtYmVyJykgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgbiBhcmd1bWVudCB0byBiZSBhIG51bWJlcicpO1xuICBvcHRzID0gb3B0cyB8fCB7fTtcbiAgaWYgKHR5cGVvZiBvcHRzID09PSAnYm9vbGVhbicpIHtcbiAgICBvcHRzID0geyBlbmRwb2ludDogdHJ1ZSB9O1xuICB9XG4gIHZhciBvZmZzZXQgPSBkZWZpbmVkKG9wdHMub2Zmc2V0LCAwKTtcbiAgaWYgKG9wdHMuZW5kcG9pbnQpIHtcbiAgICByZXR1cm4gbmV3QXJyYXkobikubWFwKGZ1bmN0aW9uIChfLCBpKSB7XG4gICAgICByZXR1cm4gbiA8PSAxID8gMCA6ICgoaSArIG9mZnNldCkgLyAobiAtIDEpKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3QXJyYXkobikubWFwKGZ1bmN0aW9uIChfLCBpKSB7XG4gICAgICByZXR1cm4gKGkgKyBvZmZzZXQpIC8gbjtcbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsZXJwRnJhbWVzICh2YWx1ZXMsIHQsIG91dCkge1xuICB0ID0gY2xhbXAodCwgMCwgMSk7XG5cbiAgdmFyIGxlbiA9IHZhbHVlcy5sZW5ndGggLSAxO1xuICB2YXIgd2hvbGUgPSB0ICogbGVuO1xuICB2YXIgZnJhbWUgPSBNYXRoLmZsb29yKHdob2xlKTtcbiAgdmFyIGZyYWN0ID0gd2hvbGUgLSBmcmFtZTtcblxuICB2YXIgbmV4dEZyYW1lID0gTWF0aC5taW4oZnJhbWUgKyAxLCBsZW4pO1xuICB2YXIgYSA9IHZhbHVlc1tmcmFtZSAlIHZhbHVlcy5sZW5ndGhdO1xuICB2YXIgYiA9IHZhbHVlc1tuZXh0RnJhbWUgJSB2YWx1ZXMubGVuZ3RoXTtcbiAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gbGVycChhLCBiLCBmcmFjdCk7XG4gIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhKSAmJiBBcnJheS5pc0FycmF5KGIpKSB7XG4gICAgcmV0dXJuIGxlcnBBcnJheShhLCBiLCBmcmFjdCwgb3V0KTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdNaXNtYXRjaCBpbiB2YWx1ZSB0eXBlIG9mIHR3byBhcnJheSBlbGVtZW50czogJyArIGZyYW1lICsgJyBhbmQgJyArIG5leHRGcmFtZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbW9kIChhLCBiKSB7XG4gIHJldHVybiAoKGEgJSBiKSArIGIpICUgYjtcbn1cblxuZnVuY3Rpb24gZGVnVG9SYWQgKG4pIHtcbiAgcmV0dXJuIG4gKiBNYXRoLlBJIC8gMTgwO1xufVxuXG5mdW5jdGlvbiByYWRUb0RlZyAobikge1xuICByZXR1cm4gbiAqIDE4MCAvIE1hdGguUEk7XG59XG5cbmZ1bmN0aW9uIGZyYWN0IChuKSB7XG4gIHJldHVybiBuIC0gTWF0aC5mbG9vcihuKTtcbn1cblxuZnVuY3Rpb24gc2lnbiAobikge1xuICBpZiAobiA+IDApIHJldHVybiAxO1xuICBlbHNlIGlmIChuIDwgMCkgcmV0dXJuIC0xO1xuICBlbHNlIHJldHVybiAwO1xufVxuXG4vLyBTcGVjaWZpYyBmdW5jdGlvbiBmcm9tIFVuaXR5IC8gb2ZNYXRoLCBub3Qgc3VyZSBpdHMgbmVlZGVkP1xuLy8gZnVuY3Rpb24gbGVycFdyYXAgKGEsIGIsIHQsIG1pbiwgbWF4KSB7XG4vLyAgIHJldHVybiB3cmFwKGEgKyB3cmFwKGIgLSBhLCBtaW4sIG1heCkgKiB0LCBtaW4sIG1heClcbi8vIH1cblxuZnVuY3Rpb24gcGluZ1BvbmcgKHQsIGxlbmd0aCkge1xuICB0ID0gbW9kKHQsIGxlbmd0aCAqIDIpO1xuICByZXR1cm4gbGVuZ3RoIC0gTWF0aC5hYnModCAtIGxlbmd0aCk7XG59XG5cbmZ1bmN0aW9uIGRhbXAgKGEsIGIsIGxhbWJkYSwgZHQpIHtcbiAgcmV0dXJuIGxlcnAoYSwgYiwgMSAtIE1hdGguZXhwKC1sYW1iZGEgKiBkdCkpO1xufVxuXG5mdW5jdGlvbiBkYW1wQXJyYXkgKGEsIGIsIGxhbWJkYSwgZHQsIG91dCkge1xuICBvdXQgPSBvdXQgfHwgW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgIG91dFtpXSA9IGRhbXAoYVtpXSwgYltpXSwgbGFtYmRhLCBkdCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gbWFwUmFuZ2UgKHZhbHVlLCBpbnB1dE1pbiwgaW5wdXRNYXgsIG91dHB1dE1pbiwgb3V0cHV0TWF4LCBjbGFtcCkge1xuICAvLyBSZWZlcmVuY2U6XG4gIC8vIGh0dHBzOi8vb3BlbmZyYW1ld29ya3MuY2MvZG9jdW1lbnRhdGlvbi9tYXRoL29mTWF0aC9cbiAgaWYgKE1hdGguYWJzKGlucHV0TWluIC0gaW5wdXRNYXgpIDwgRVBTSUxPTikge1xuICAgIHJldHVybiBvdXRwdXRNaW47XG4gIH0gZWxzZSB7XG4gICAgdmFyIG91dFZhbCA9ICgodmFsdWUgLSBpbnB1dE1pbikgLyAoaW5wdXRNYXggLSBpbnB1dE1pbikgKiAob3V0cHV0TWF4IC0gb3V0cHV0TWluKSArIG91dHB1dE1pbik7XG4gICAgaWYgKGNsYW1wKSB7XG4gICAgICBpZiAob3V0cHV0TWF4IDwgb3V0cHV0TWluKSB7XG4gICAgICAgIGlmIChvdXRWYWwgPCBvdXRwdXRNYXgpIG91dFZhbCA9IG91dHB1dE1heDtcbiAgICAgICAgZWxzZSBpZiAob3V0VmFsID4gb3V0cHV0TWluKSBvdXRWYWwgPSBvdXRwdXRNaW47XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAob3V0VmFsID4gb3V0cHV0TWF4KSBvdXRWYWwgPSBvdXRwdXRNYXg7XG4gICAgICAgIGVsc2UgaWYgKG91dFZhbCA8IG91dHB1dE1pbikgb3V0VmFsID0gb3V0cHV0TWluO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0VmFsO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBtb2Q6IG1vZCxcbiAgZnJhY3Q6IGZyYWN0LFxuICBzaWduOiBzaWduLFxuICBkZWdUb1JhZDogZGVnVG9SYWQsXG4gIHJhZFRvRGVnOiByYWRUb0RlZyxcbiAgd3JhcDogd3JhcCxcbiAgcGluZ1Bvbmc6IHBpbmdQb25nLFxuICBsaW5zcGFjZTogbGluc3BhY2UsXG4gIGxlcnA6IGxlcnAsXG4gIGxlcnBBcnJheTogbGVycEFycmF5LFxuICBpbnZlcnNlTGVycDogaW52ZXJzZUxlcnAsXG4gIGxlcnBGcmFtZXM6IGxlcnBGcmFtZXMsXG4gIGNsYW1wOiBjbGFtcCxcbiAgY2xhbXAwMTogY2xhbXAwMSxcbiAgc21vb3Roc3RlcDogc21vb3Roc3RlcCxcbiAgZGFtcDogZGFtcCxcbiAgZGFtcEFycmF5OiBkYW1wQXJyYXksXG4gIG1hcFJhbmdlOiBtYXBSYW5nZSxcbiAgZXhwYW5kMkQ6IGV4cGFuZFZlY3RvcigyKSxcbiAgZXhwYW5kM0Q6IGV4cGFuZFZlY3RvcigzKSxcbiAgZXhwYW5kNEQ6IGV4cGFuZFZlY3Rvcig0KVxufTtcbiIsInZhciBzZWVkUmFuZG9tID0gcmVxdWlyZSgnc2VlZC1yYW5kb20nKTtcbnZhciBTaW1wbGV4Tm9pc2UgPSByZXF1aXJlKCdzaW1wbGV4LW5vaXNlJyk7XG52YXIgZGVmaW5lZCA9IHJlcXVpcmUoJ2RlZmluZWQnKTtcblxuZnVuY3Rpb24gY3JlYXRlUmFuZG9tIChkZWZhdWx0U2VlZCkge1xuICBkZWZhdWx0U2VlZCA9IGRlZmluZWQoZGVmYXVsdFNlZWQsIG51bGwpO1xuICB2YXIgZGVmYXVsdFJhbmRvbSA9IE1hdGgucmFuZG9tO1xuICB2YXIgY3VycmVudFNlZWQ7XG4gIHZhciBjdXJyZW50UmFuZG9tO1xuICB2YXIgbm9pc2VHZW5lcmF0b3I7XG4gIHZhciBfbmV4dEdhdXNzaWFuID0gbnVsbDtcbiAgdmFyIF9oYXNOZXh0R2F1c3NpYW4gPSBmYWxzZTtcblxuICBzZXRTZWVkKGRlZmF1bHRTZWVkKTtcblxuICByZXR1cm4ge1xuICAgIHZhbHVlOiB2YWx1ZSxcbiAgICBjcmVhdGVSYW5kb206IGZ1bmN0aW9uIChkZWZhdWx0U2VlZCkge1xuICAgICAgcmV0dXJuIGNyZWF0ZVJhbmRvbShkZWZhdWx0U2VlZCk7XG4gICAgfSxcbiAgICBzZXRTZWVkOiBzZXRTZWVkLFxuICAgIGdldFNlZWQ6IGdldFNlZWQsXG4gICAgZ2V0UmFuZG9tU2VlZDogZ2V0UmFuZG9tU2VlZCxcbiAgICB2YWx1ZU5vblplcm86IHZhbHVlTm9uWmVybyxcbiAgICBwZXJtdXRlTm9pc2U6IHBlcm11dGVOb2lzZSxcbiAgICBub2lzZTFEOiBub2lzZTFELFxuICAgIG5vaXNlMkQ6IG5vaXNlMkQsXG4gICAgbm9pc2UzRDogbm9pc2UzRCxcbiAgICBub2lzZTREOiBub2lzZTRELFxuICAgIHNpZ246IHNpZ24sXG4gICAgYm9vbGVhbjogYm9vbGVhbixcbiAgICBjaGFuY2U6IGNoYW5jZSxcbiAgICByYW5nZTogcmFuZ2UsXG4gICAgcmFuZ2VGbG9vcjogcmFuZ2VGbG9vcixcbiAgICBwaWNrOiBwaWNrLFxuICAgIHNodWZmbGU6IHNodWZmbGUsXG4gICAgb25DaXJjbGU6IG9uQ2lyY2xlLFxuICAgIGluc2lkZUNpcmNsZTogaW5zaWRlQ2lyY2xlLFxuICAgIG9uU3BoZXJlOiBvblNwaGVyZSxcbiAgICBpbnNpZGVTcGhlcmU6IGluc2lkZVNwaGVyZSxcbiAgICBxdWF0ZXJuaW9uOiBxdWF0ZXJuaW9uLFxuICAgIHdlaWdodGVkOiB3ZWlnaHRlZCxcbiAgICB3ZWlnaHRlZFNldDogd2VpZ2h0ZWRTZXQsXG4gICAgd2VpZ2h0ZWRTZXRJbmRleDogd2VpZ2h0ZWRTZXRJbmRleCxcbiAgICBnYXVzc2lhbjogZ2F1c3NpYW5cbiAgfTtcblxuICBmdW5jdGlvbiBzZXRTZWVkIChzZWVkLCBvcHQpIHtcbiAgICBpZiAodHlwZW9mIHNlZWQgPT09ICdudW1iZXInIHx8IHR5cGVvZiBzZWVkID09PSAnc3RyaW5nJykge1xuICAgICAgY3VycmVudFNlZWQgPSBzZWVkO1xuICAgICAgY3VycmVudFJhbmRvbSA9IHNlZWRSYW5kb20oY3VycmVudFNlZWQsIG9wdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnRTZWVkID0gdW5kZWZpbmVkO1xuICAgICAgY3VycmVudFJhbmRvbSA9IGRlZmF1bHRSYW5kb207XG4gICAgfVxuICAgIG5vaXNlR2VuZXJhdG9yID0gY3JlYXRlTm9pc2UoKTtcbiAgICBfbmV4dEdhdXNzaWFuID0gbnVsbDtcbiAgICBfaGFzTmV4dEdhdXNzaWFuID0gZmFsc2U7XG4gIH1cblxuICBmdW5jdGlvbiB2YWx1ZSAoKSB7XG4gICAgcmV0dXJuIGN1cnJlbnRSYW5kb20oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHZhbHVlTm9uWmVybyAoKSB7XG4gICAgdmFyIHUgPSAwO1xuICAgIHdoaWxlICh1ID09PSAwKSB1ID0gdmFsdWUoKTtcbiAgICByZXR1cm4gdTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNlZWQgKCkge1xuICAgIHJldHVybiBjdXJyZW50U2VlZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFJhbmRvbVNlZWQgKCkge1xuICAgIHZhciBzZWVkID0gU3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApKTtcbiAgICByZXR1cm4gc2VlZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU5vaXNlICgpIHtcbiAgICByZXR1cm4gbmV3IFNpbXBsZXhOb2lzZShjdXJyZW50UmFuZG9tKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBlcm11dGVOb2lzZSAoKSB7XG4gICAgbm9pc2VHZW5lcmF0b3IgPSBjcmVhdGVOb2lzZSgpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9pc2UxRCAoeCwgZnJlcXVlbmN5LCBhbXBsaXR1ZGUpIHtcbiAgICBpZiAoIWlzRmluaXRlKHgpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd4IGNvbXBvbmVudCBmb3Igbm9pc2UoKSBtdXN0IGJlIGZpbml0ZScpO1xuICAgIGZyZXF1ZW5jeSA9IGRlZmluZWQoZnJlcXVlbmN5LCAxKTtcbiAgICBhbXBsaXR1ZGUgPSBkZWZpbmVkKGFtcGxpdHVkZSwgMSk7XG4gICAgcmV0dXJuIGFtcGxpdHVkZSAqIG5vaXNlR2VuZXJhdG9yLm5vaXNlMkQoeCAqIGZyZXF1ZW5jeSwgMCk7XG4gIH1cblxuICBmdW5jdGlvbiBub2lzZTJEICh4LCB5LCBmcmVxdWVuY3ksIGFtcGxpdHVkZSkge1xuICAgIGlmICghaXNGaW5pdGUoeCkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ggY29tcG9uZW50IGZvciBub2lzZSgpIG11c3QgYmUgZmluaXRlJyk7XG4gICAgaWYgKCFpc0Zpbml0ZSh5KSkgdGhyb3cgbmV3IFR5cGVFcnJvcigneSBjb21wb25lbnQgZm9yIG5vaXNlKCkgbXVzdCBiZSBmaW5pdGUnKTtcbiAgICBmcmVxdWVuY3kgPSBkZWZpbmVkKGZyZXF1ZW5jeSwgMSk7XG4gICAgYW1wbGl0dWRlID0gZGVmaW5lZChhbXBsaXR1ZGUsIDEpO1xuICAgIHJldHVybiBhbXBsaXR1ZGUgKiBub2lzZUdlbmVyYXRvci5ub2lzZTJEKHggKiBmcmVxdWVuY3ksIHkgKiBmcmVxdWVuY3kpO1xuICB9XG5cbiAgZnVuY3Rpb24gbm9pc2UzRCAoeCwgeSwgeiwgZnJlcXVlbmN5LCBhbXBsaXR1ZGUpIHtcbiAgICBpZiAoIWlzRmluaXRlKHgpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd4IGNvbXBvbmVudCBmb3Igbm9pc2UoKSBtdXN0IGJlIGZpbml0ZScpO1xuICAgIGlmICghaXNGaW5pdGUoeSkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ3kgY29tcG9uZW50IGZvciBub2lzZSgpIG11c3QgYmUgZmluaXRlJyk7XG4gICAgaWYgKCFpc0Zpbml0ZSh6KSkgdGhyb3cgbmV3IFR5cGVFcnJvcigneiBjb21wb25lbnQgZm9yIG5vaXNlKCkgbXVzdCBiZSBmaW5pdGUnKTtcbiAgICBmcmVxdWVuY3kgPSBkZWZpbmVkKGZyZXF1ZW5jeSwgMSk7XG4gICAgYW1wbGl0dWRlID0gZGVmaW5lZChhbXBsaXR1ZGUsIDEpO1xuICAgIHJldHVybiBhbXBsaXR1ZGUgKiBub2lzZUdlbmVyYXRvci5ub2lzZTNEKFxuICAgICAgeCAqIGZyZXF1ZW5jeSxcbiAgICAgIHkgKiBmcmVxdWVuY3ksXG4gICAgICB6ICogZnJlcXVlbmN5XG4gICAgKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vaXNlNEQgKHgsIHksIHosIHcsIGZyZXF1ZW5jeSwgYW1wbGl0dWRlKSB7XG4gICAgaWYgKCFpc0Zpbml0ZSh4KSkgdGhyb3cgbmV3IFR5cGVFcnJvcigneCBjb21wb25lbnQgZm9yIG5vaXNlKCkgbXVzdCBiZSBmaW5pdGUnKTtcbiAgICBpZiAoIWlzRmluaXRlKHkpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd5IGNvbXBvbmVudCBmb3Igbm9pc2UoKSBtdXN0IGJlIGZpbml0ZScpO1xuICAgIGlmICghaXNGaW5pdGUoeikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ogY29tcG9uZW50IGZvciBub2lzZSgpIG11c3QgYmUgZmluaXRlJyk7XG4gICAgaWYgKCFpc0Zpbml0ZSh3KSkgdGhyb3cgbmV3IFR5cGVFcnJvcigndyBjb21wb25lbnQgZm9yIG5vaXNlKCkgbXVzdCBiZSBmaW5pdGUnKTtcbiAgICBmcmVxdWVuY3kgPSBkZWZpbmVkKGZyZXF1ZW5jeSwgMSk7XG4gICAgYW1wbGl0dWRlID0gZGVmaW5lZChhbXBsaXR1ZGUsIDEpO1xuICAgIHJldHVybiBhbXBsaXR1ZGUgKiBub2lzZUdlbmVyYXRvci5ub2lzZTREKFxuICAgICAgeCAqIGZyZXF1ZW5jeSxcbiAgICAgIHkgKiBmcmVxdWVuY3ksXG4gICAgICB6ICogZnJlcXVlbmN5LFxuICAgICAgdyAqIGZyZXF1ZW5jeVxuICAgICk7XG4gIH1cblxuICBmdW5jdGlvbiBzaWduICgpIHtcbiAgICByZXR1cm4gYm9vbGVhbigpID8gMSA6IC0xO1xuICB9XG5cbiAgZnVuY3Rpb24gYm9vbGVhbiAoKSB7XG4gICAgcmV0dXJuIHZhbHVlKCkgPiAwLjU7XG4gIH1cblxuICBmdW5jdGlvbiBjaGFuY2UgKG4pIHtcbiAgICBuID0gZGVmaW5lZChuLCAwLjUpO1xuICAgIGlmICh0eXBlb2YgbiAhPT0gJ251bWJlcicpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2V4cGVjdGVkIG4gdG8gYmUgYSBudW1iZXInKTtcbiAgICByZXR1cm4gdmFsdWUoKSA8IG47XG4gIH1cblxuICBmdW5jdGlvbiByYW5nZSAobWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBtaW4gIT09ICdudW1iZXInIHx8IHR5cGVvZiBtYXggIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhbGwgYXJndW1lbnRzIHRvIGJlIG51bWJlcnMnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdmFsdWUoKSAqIChtYXggLSBtaW4pICsgbWluO1xuICB9XG5cbiAgZnVuY3Rpb24gcmFuZ2VGbG9vciAobWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBtaW4gIT09ICdudW1iZXInIHx8IHR5cGVvZiBtYXggIT09ICdudW1iZXInKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhbGwgYXJndW1lbnRzIHRvIGJlIG51bWJlcnMnKTtcbiAgICB9XG5cbiAgICByZXR1cm4gTWF0aC5mbG9vcihyYW5nZShtaW4sIG1heCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGljayAoYXJyYXkpIHtcbiAgICBpZiAoYXJyYXkubGVuZ3RoID09PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIHJldHVybiBhcnJheVtyYW5nZUZsb29yKDAsIGFycmF5Lmxlbmd0aCldO1xuICB9XG5cbiAgZnVuY3Rpb24gc2h1ZmZsZSAoYXJyKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFycikpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIEFycmF5LCBnb3QgJyArIHR5cGVvZiBhcnIpO1xuICAgIH1cblxuICAgIHZhciByYW5kO1xuICAgIHZhciB0bXA7XG4gICAgdmFyIGxlbiA9IGFyci5sZW5ndGg7XG4gICAgdmFyIHJldCA9IGFyci5zbGljZSgpO1xuICAgIHdoaWxlIChsZW4pIHtcbiAgICAgIHJhbmQgPSBNYXRoLmZsb29yKHZhbHVlKCkgKiBsZW4tLSk7XG4gICAgICB0bXAgPSByZXRbbGVuXTtcbiAgICAgIHJldFtsZW5dID0gcmV0W3JhbmRdO1xuICAgICAgcmV0W3JhbmRdID0gdG1wO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgZnVuY3Rpb24gb25DaXJjbGUgKHJhZGl1cywgb3V0KSB7XG4gICAgcmFkaXVzID0gZGVmaW5lZChyYWRpdXMsIDEpO1xuICAgIG91dCA9IG91dCB8fCBbXTtcbiAgICB2YXIgdGhldGEgPSB2YWx1ZSgpICogMi4wICogTWF0aC5QSTtcbiAgICBvdXRbMF0gPSByYWRpdXMgKiBNYXRoLmNvcyh0aGV0YSk7XG4gICAgb3V0WzFdID0gcmFkaXVzICogTWF0aC5zaW4odGhldGEpO1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICBmdW5jdGlvbiBpbnNpZGVDaXJjbGUgKHJhZGl1cywgb3V0KSB7XG4gICAgcmFkaXVzID0gZGVmaW5lZChyYWRpdXMsIDEpO1xuICAgIG91dCA9IG91dCB8fCBbXTtcbiAgICBvbkNpcmNsZSgxLCBvdXQpO1xuICAgIHZhciByID0gcmFkaXVzICogTWF0aC5zcXJ0KHZhbHVlKCkpO1xuICAgIG91dFswXSAqPSByO1xuICAgIG91dFsxXSAqPSByO1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICBmdW5jdGlvbiBvblNwaGVyZSAocmFkaXVzLCBvdXQpIHtcbiAgICByYWRpdXMgPSBkZWZpbmVkKHJhZGl1cywgMSk7XG4gICAgb3V0ID0gb3V0IHx8IFtdO1xuICAgIHZhciB1ID0gdmFsdWUoKSAqIE1hdGguUEkgKiAyO1xuICAgIHZhciB2ID0gdmFsdWUoKSAqIDIgLSAxO1xuICAgIHZhciBwaGkgPSB1O1xuICAgIHZhciB0aGV0YSA9IE1hdGguYWNvcyh2KTtcbiAgICBvdXRbMF0gPSByYWRpdXMgKiBNYXRoLnNpbih0aGV0YSkgKiBNYXRoLmNvcyhwaGkpO1xuICAgIG91dFsxXSA9IHJhZGl1cyAqIE1hdGguc2luKHRoZXRhKSAqIE1hdGguc2luKHBoaSk7XG4gICAgb3V0WzJdID0gcmFkaXVzICogTWF0aC5jb3ModGhldGEpO1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICBmdW5jdGlvbiBpbnNpZGVTcGhlcmUgKHJhZGl1cywgb3V0KSB7XG4gICAgcmFkaXVzID0gZGVmaW5lZChyYWRpdXMsIDEpO1xuICAgIG91dCA9IG91dCB8fCBbXTtcbiAgICB2YXIgdSA9IHZhbHVlKCkgKiBNYXRoLlBJICogMjtcbiAgICB2YXIgdiA9IHZhbHVlKCkgKiAyIC0gMTtcbiAgICB2YXIgayA9IHZhbHVlKCk7XG5cbiAgICB2YXIgcGhpID0gdTtcbiAgICB2YXIgdGhldGEgPSBNYXRoLmFjb3Modik7XG4gICAgdmFyIHIgPSByYWRpdXMgKiBNYXRoLmNicnQoayk7XG4gICAgb3V0WzBdID0gciAqIE1hdGguc2luKHRoZXRhKSAqIE1hdGguY29zKHBoaSk7XG4gICAgb3V0WzFdID0gciAqIE1hdGguc2luKHRoZXRhKSAqIE1hdGguc2luKHBoaSk7XG4gICAgb3V0WzJdID0gciAqIE1hdGguY29zKHRoZXRhKTtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgZnVuY3Rpb24gcXVhdGVybmlvbiAob3V0KSB7XG4gICAgb3V0ID0gb3V0IHx8IFtdO1xuICAgIHZhciB1MSA9IHZhbHVlKCk7XG4gICAgdmFyIHUyID0gdmFsdWUoKTtcbiAgICB2YXIgdTMgPSB2YWx1ZSgpO1xuXG4gICAgdmFyIHNxMSA9IE1hdGguc3FydCgxIC0gdTEpO1xuICAgIHZhciBzcTIgPSBNYXRoLnNxcnQodTEpO1xuXG4gICAgdmFyIHRoZXRhMSA9IE1hdGguUEkgKiAyICogdTI7XG4gICAgdmFyIHRoZXRhMiA9IE1hdGguUEkgKiAyICogdTM7XG5cbiAgICB2YXIgeCA9IE1hdGguc2luKHRoZXRhMSkgKiBzcTE7XG4gICAgdmFyIHkgPSBNYXRoLmNvcyh0aGV0YTEpICogc3ExO1xuICAgIHZhciB6ID0gTWF0aC5zaW4odGhldGEyKSAqIHNxMjtcbiAgICB2YXIgdyA9IE1hdGguY29zKHRoZXRhMikgKiBzcTI7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIG91dFsyXSA9IHo7XG4gICAgb3V0WzNdID0gdztcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgZnVuY3Rpb24gd2VpZ2h0ZWRTZXQgKHNldCkge1xuICAgIHNldCA9IHNldCB8fCBbXTtcbiAgICBpZiAoc2V0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHNldFt3ZWlnaHRlZFNldEluZGV4KHNldCldLnZhbHVlO1xuICB9XG5cbiAgZnVuY3Rpb24gd2VpZ2h0ZWRTZXRJbmRleCAoc2V0KSB7XG4gICAgc2V0ID0gc2V0IHx8IFtdO1xuICAgIGlmIChzZXQubGVuZ3RoID09PSAwKSByZXR1cm4gLTE7XG4gICAgcmV0dXJuIHdlaWdodGVkKHNldC5tYXAoZnVuY3Rpb24gKHMpIHtcbiAgICAgIHJldHVybiBzLndlaWdodDtcbiAgICB9KSk7XG4gIH1cblxuICBmdW5jdGlvbiB3ZWlnaHRlZCAod2VpZ2h0cykge1xuICAgIHdlaWdodHMgPSB3ZWlnaHRzIHx8IFtdO1xuICAgIGlmICh3ZWlnaHRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIC0xO1xuICAgIHZhciB0b3RhbFdlaWdodCA9IDA7XG4gICAgdmFyIGk7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgd2VpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxXZWlnaHQgKz0gd2VpZ2h0c1tpXTtcbiAgICB9XG5cbiAgICBpZiAodG90YWxXZWlnaHQgPD0gMCkgdGhyb3cgbmV3IEVycm9yKCdXZWlnaHRzIG11c3Qgc3VtIHRvID4gMCcpO1xuXG4gICAgdmFyIHJhbmRvbSA9IHZhbHVlKCkgKiB0b3RhbFdlaWdodDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgd2VpZ2h0cy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHJhbmRvbSA8IHdlaWdodHNbaV0pIHtcbiAgICAgICAgcmV0dXJuIGk7XG4gICAgICB9XG4gICAgICByYW5kb20gLT0gd2VpZ2h0c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICBmdW5jdGlvbiBnYXVzc2lhbiAobWVhbiwgc3RhbmRhcmREZXJpdmF0aW9uKSB7XG4gICAgbWVhbiA9IGRlZmluZWQobWVhbiwgMCk7XG4gICAgc3RhbmRhcmREZXJpdmF0aW9uID0gZGVmaW5lZChzdGFuZGFyZERlcml2YXRpb24sIDEpO1xuXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL29wZW5qZGstbWlycm9yL2pkazd1LWpkay9ibG9iL2Y0ZDgwOTU3ZTg5YTE5YTI5YmI5Zjk4MDdkMmEyODM1MWVkN2Y3ZGYvc3JjL3NoYXJlL2NsYXNzZXMvamF2YS91dGlsL1JhbmRvbS5qYXZhI0w0OTZcbiAgICBpZiAoX2hhc05leHRHYXVzc2lhbikge1xuICAgICAgX2hhc05leHRHYXVzc2lhbiA9IGZhbHNlO1xuICAgICAgdmFyIHJlc3VsdCA9IF9uZXh0R2F1c3NpYW47XG4gICAgICBfbmV4dEdhdXNzaWFuID0gbnVsbDtcbiAgICAgIHJldHVybiBtZWFuICsgc3RhbmRhcmREZXJpdmF0aW9uICogcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgdjEgPSAwO1xuICAgICAgdmFyIHYyID0gMDtcbiAgICAgIHZhciBzID0gMDtcbiAgICAgIGRvIHtcbiAgICAgICAgdjEgPSB2YWx1ZSgpICogMiAtIDE7IC8vIGJldHdlZW4gLTEgYW5kIDFcbiAgICAgICAgdjIgPSB2YWx1ZSgpICogMiAtIDE7IC8vIGJldHdlZW4gLTEgYW5kIDFcbiAgICAgICAgcyA9IHYxICogdjEgKyB2MiAqIHYyO1xuICAgICAgfSB3aGlsZSAocyA+PSAxIHx8IHMgPT09IDApO1xuICAgICAgdmFyIG11bHRpcGxpZXIgPSBNYXRoLnNxcnQoLTIgKiBNYXRoLmxvZyhzKSAvIHMpO1xuICAgICAgX25leHRHYXVzc2lhbiA9ICh2MiAqIG11bHRpcGxpZXIpO1xuICAgICAgX2hhc05leHRHYXVzc2lhbiA9IHRydWU7XG4gICAgICByZXR1cm4gbWVhbiArIHN0YW5kYXJkRGVyaXZhdGlvbiAqICh2MSAqIG11bHRpcGxpZXIpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVJhbmRvbSgpO1xuIiwiLypcbm9iamVjdC1hc3NpZ25cbihjKSBTaW5kcmUgU29yaHVzXG5AbGljZW5zZSBNSVRcbiovXG5cbid1c2Ugc3RyaWN0Jztcbi8qIGVzbGludC1kaXNhYmxlIG5vLXVudXNlZC12YXJzICovXG52YXIgZ2V0T3duUHJvcGVydHlTeW1ib2xzID0gT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scztcbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgcHJvcElzRW51bWVyYWJsZSA9IE9iamVjdC5wcm90b3R5cGUucHJvcGVydHlJc0VudW1lcmFibGU7XG5cbmZ1bmN0aW9uIHRvT2JqZWN0KHZhbCkge1xuXHRpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignT2JqZWN0LmFzc2lnbiBjYW5ub3QgYmUgY2FsbGVkIHdpdGggbnVsbCBvciB1bmRlZmluZWQnKTtcblx0fVxuXG5cdHJldHVybiBPYmplY3QodmFsKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkVXNlTmF0aXZlKCkge1xuXHR0cnkge1xuXHRcdGlmICghT2JqZWN0LmFzc2lnbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERldGVjdCBidWdneSBwcm9wZXJ0eSBlbnVtZXJhdGlvbiBvcmRlciBpbiBvbGRlciBWOCB2ZXJzaW9ucy5cblxuXHRcdC8vIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTQxMThcblx0XHR2YXIgdGVzdDEgPSBuZXcgU3RyaW5nKCdhYmMnKTsgIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tbmV3LXdyYXBwZXJzXG5cdFx0dGVzdDFbNV0gPSAnZGUnO1xuXHRcdGlmIChPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0ZXN0MSlbMF0gPT09ICc1Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTMwNTZcblx0XHR2YXIgdGVzdDIgPSB7fTtcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdHRlc3QyWydfJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoaSldID0gaTtcblx0XHR9XG5cdFx0dmFyIG9yZGVyMiA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHRlc3QyKS5tYXAoZnVuY3Rpb24gKG4pIHtcblx0XHRcdHJldHVybiB0ZXN0MltuXTtcblx0XHR9KTtcblx0XHRpZiAob3JkZXIyLmpvaW4oJycpICE9PSAnMDEyMzQ1Njc4OScpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBodHRwczovL2J1Z3MuY2hyb21pdW0ub3JnL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0zMDU2XG5cdFx0dmFyIHRlc3QzID0ge307XG5cdFx0J2FiY2RlZmdoaWprbG1ub3BxcnN0Jy5zcGxpdCgnJykuZm9yRWFjaChmdW5jdGlvbiAobGV0dGVyKSB7XG5cdFx0XHR0ZXN0M1tsZXR0ZXJdID0gbGV0dGVyO1xuXHRcdH0pO1xuXHRcdGlmIChPYmplY3Qua2V5cyhPYmplY3QuYXNzaWduKHt9LCB0ZXN0MykpLmpvaW4oJycpICE9PVxuXHRcdFx0XHQnYWJjZGVmZ2hpamtsbW5vcHFyc3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdC8vIFdlIGRvbid0IGV4cGVjdCBhbnkgb2YgdGhlIGFib3ZlIHRvIHRocm93LCBidXQgYmV0dGVyIHRvIGJlIHNhZmUuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc2hvdWxkVXNlTmF0aXZlKCkgPyBPYmplY3QuYXNzaWduIDogZnVuY3Rpb24gKHRhcmdldCwgc291cmNlKSB7XG5cdHZhciBmcm9tO1xuXHR2YXIgdG8gPSB0b09iamVjdCh0YXJnZXQpO1xuXHR2YXIgc3ltYm9scztcblxuXHRmb3IgKHZhciBzID0gMTsgcyA8IGFyZ3VtZW50cy5sZW5ndGg7IHMrKykge1xuXHRcdGZyb20gPSBPYmplY3QoYXJndW1lbnRzW3NdKTtcblxuXHRcdGZvciAodmFyIGtleSBpbiBmcm9tKSB7XG5cdFx0XHRpZiAoaGFzT3duUHJvcGVydHkuY2FsbChmcm9tLCBrZXkpKSB7XG5cdFx0XHRcdHRvW2tleV0gPSBmcm9tW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGdldE93blByb3BlcnR5U3ltYm9scykge1xuXHRcdFx0c3ltYm9scyA9IGdldE93blByb3BlcnR5U3ltYm9scyhmcm9tKTtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgc3ltYm9scy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocHJvcElzRW51bWVyYWJsZS5jYWxsKGZyb20sIHN5bWJvbHNbaV0pKSB7XG5cdFx0XHRcdFx0dG9bc3ltYm9sc1tpXV0gPSBmcm9tW3N5bWJvbHNbaV1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRvO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID1cbiAgZ2xvYmFsLnBlcmZvcm1hbmNlICYmXG4gIGdsb2JhbC5wZXJmb3JtYW5jZS5ub3cgPyBmdW5jdGlvbiBub3coKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpXG4gIH0gOiBEYXRlLm5vdyB8fCBmdW5jdGlvbiBub3coKSB7XG4gICAgcmV0dXJuICtuZXcgRGF0ZVxuICB9XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGlzUHJvbWlzZTtcblxuZnVuY3Rpb24gaXNQcm9taXNlKG9iaikge1xuICByZXR1cm4gISFvYmogJiYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnIHx8IHR5cGVvZiBvYmogPT09ICdmdW5jdGlvbicpICYmIHR5cGVvZiBvYmoudGhlbiA9PT0gJ2Z1bmN0aW9uJztcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gaXNOb2RlXG5cbmZ1bmN0aW9uIGlzTm9kZSAodmFsKSB7XG4gIHJldHVybiAoIXZhbCB8fCB0eXBlb2YgdmFsICE9PSAnb2JqZWN0JylcbiAgICA/IGZhbHNlXG4gICAgOiAodHlwZW9mIHdpbmRvdyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIHdpbmRvdy5Ob2RlID09PSAnb2JqZWN0JylcbiAgICAgID8gKHZhbCBpbnN0YW5jZW9mIHdpbmRvdy5Ob2RlKVxuICAgICAgOiAodHlwZW9mIHZhbC5ub2RlVHlwZSA9PT0gJ251bWJlcicpICYmXG4gICAgICAgICh0eXBlb2YgdmFsLm5vZGVOYW1lID09PSAnc3RyaW5nJylcbn1cbiIsIi8vIFRPRE86IFdlIGNhbiByZW1vdmUgYSBodWdlIGNodW5rIG9mIGJ1bmRsZSBzaXplIGJ5IHVzaW5nIGEgc21hbGxlclxuLy8gdXRpbGl0eSBtb2R1bGUgZm9yIGNvbnZlcnRpbmcgdW5pdHMuXG5pbXBvcnQgaXNET00gZnJvbSAnaXMtZG9tJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENsaWVudEFQSSAoKSB7XG4gIHJldHVybiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3dbJ2NhbnZhcy1za2V0Y2gtY2xpJ107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVkICgpIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoYXJndW1lbnRzW2ldICE9IG51bGwpIHtcbiAgICAgIHJldHVybiBhcmd1bWVudHNbaV07XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0Jyb3dzZXIgKCkge1xuICByZXR1cm4gdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzV2ViR0xDb250ZXh0IChjdHgpIHtcbiAgcmV0dXJuIHR5cGVvZiBjdHguY2xlYXIgPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGN0eC5jbGVhckNvbG9yID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBjdHguYnVmZmVyRGF0YSA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2FudmFzIChlbGVtZW50KSB7XG4gIHJldHVybiBpc0RPTShlbGVtZW50KSAmJiAvY2FudmFzL2kudGVzdChlbGVtZW50Lm5vZGVOYW1lKSAmJiB0eXBlb2YgZWxlbWVudC5nZXRDb250ZXh0ID09PSAnZnVuY3Rpb24nO1xufVxuIiwiZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gdHlwZW9mIE9iamVjdC5rZXlzID09PSAnZnVuY3Rpb24nXG4gID8gT2JqZWN0LmtleXMgOiBzaGltO1xuXG5leHBvcnRzLnNoaW0gPSBzaGltO1xuZnVuY3Rpb24gc2hpbSAob2JqKSB7XG4gIHZhciBrZXlzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIGtleXMucHVzaChrZXkpO1xuICByZXR1cm4ga2V5cztcbn1cbiIsInZhciBzdXBwb3J0c0FyZ3VtZW50c0NsYXNzID0gKGZ1bmN0aW9uKCl7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJndW1lbnRzKVxufSkoKSA9PSAnW29iamVjdCBBcmd1bWVudHNdJztcblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gc3VwcG9ydHNBcmd1bWVudHNDbGFzcyA/IHN1cHBvcnRlZCA6IHVuc3VwcG9ydGVkO1xuXG5leHBvcnRzLnN1cHBvcnRlZCA9IHN1cHBvcnRlZDtcbmZ1bmN0aW9uIHN1cHBvcnRlZChvYmplY3QpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmplY3QpID09ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xufTtcblxuZXhwb3J0cy51bnN1cHBvcnRlZCA9IHVuc3VwcG9ydGVkO1xuZnVuY3Rpb24gdW5zdXBwb3J0ZWQob2JqZWN0KXtcbiAgcmV0dXJuIG9iamVjdCAmJlxuICAgIHR5cGVvZiBvYmplY3QgPT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2Ygb2JqZWN0Lmxlbmd0aCA9PSAnbnVtYmVyJyAmJlxuICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsICdjYWxsZWUnKSAmJlxuICAgICFPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwob2JqZWN0LCAnY2FsbGVlJykgfHxcbiAgICBmYWxzZTtcbn07XG4iLCJ2YXIgcFNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xudmFyIG9iamVjdEtleXMgPSByZXF1aXJlKCcuL2xpYi9rZXlzLmpzJyk7XG52YXIgaXNBcmd1bWVudHMgPSByZXF1aXJlKCcuL2xpYi9pc19hcmd1bWVudHMuanMnKTtcblxudmFyIGRlZXBFcXVhbCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFjdHVhbCwgZXhwZWN0ZWQsIG9wdHMpIHtcbiAgaWYgKCFvcHRzKSBvcHRzID0ge307XG4gIC8vIDcuMS4gQWxsIGlkZW50aWNhbCB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGFzIGRldGVybWluZWQgYnkgPT09LlxuICBpZiAoYWN0dWFsID09PSBleHBlY3RlZCkge1xuICAgIHJldHVybiB0cnVlO1xuXG4gIH0gZWxzZSBpZiAoYWN0dWFsIGluc3RhbmNlb2YgRGF0ZSAmJiBleHBlY3RlZCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gYWN0dWFsLmdldFRpbWUoKSA9PT0gZXhwZWN0ZWQuZ2V0VGltZSgpO1xuXG4gIC8vIDcuMy4gT3RoZXIgcGFpcnMgdGhhdCBkbyBub3QgYm90aCBwYXNzIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyxcbiAgLy8gZXF1aXZhbGVuY2UgaXMgZGV0ZXJtaW5lZCBieSA9PS5cbiAgfSBlbHNlIGlmICghYWN0dWFsIHx8ICFleHBlY3RlZCB8fCB0eXBlb2YgYWN0dWFsICE9ICdvYmplY3QnICYmIHR5cGVvZiBleHBlY3RlZCAhPSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBvcHRzLnN0cmljdCA/IGFjdHVhbCA9PT0gZXhwZWN0ZWQgOiBhY3R1YWwgPT0gZXhwZWN0ZWQ7XG5cbiAgLy8gNy40LiBGb3IgYWxsIG90aGVyIE9iamVjdCBwYWlycywgaW5jbHVkaW5nIEFycmF5IG9iamVjdHMsIGVxdWl2YWxlbmNlIGlzXG4gIC8vIGRldGVybWluZWQgYnkgaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChhcyB2ZXJpZmllZFxuICAvLyB3aXRoIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCksIHRoZSBzYW1lIHNldCBvZiBrZXlzXG4gIC8vIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLCBlcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnlcbiAgLy8gY29ycmVzcG9uZGluZyBrZXksIGFuZCBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuIE5vdGU6IHRoaXNcbiAgLy8gYWNjb3VudHMgZm9yIGJvdGggbmFtZWQgYW5kIGluZGV4ZWQgcHJvcGVydGllcyBvbiBBcnJheXMuXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iakVxdWl2KGFjdHVhbCwgZXhwZWN0ZWQsIG9wdHMpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkT3JOdWxsKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc0J1ZmZlciAoeCkge1xuICBpZiAoIXggfHwgdHlwZW9mIHggIT09ICdvYmplY3QnIHx8IHR5cGVvZiB4Lmxlbmd0aCAhPT0gJ251bWJlcicpIHJldHVybiBmYWxzZTtcbiAgaWYgKHR5cGVvZiB4LmNvcHkgIT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIHguc2xpY2UgIT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHgubGVuZ3RoID4gMCAmJiB0eXBlb2YgeFswXSAhPT0gJ251bWJlcicpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG9iakVxdWl2KGEsIGIsIG9wdHMpIHtcbiAgdmFyIGksIGtleTtcbiAgaWYgKGlzVW5kZWZpbmVkT3JOdWxsKGEpIHx8IGlzVW5kZWZpbmVkT3JOdWxsKGIpKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy8gYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LlxuICBpZiAoYS5wcm90b3R5cGUgIT09IGIucHJvdG90eXBlKSByZXR1cm4gZmFsc2U7XG4gIC8vfn5+SSd2ZSBtYW5hZ2VkIHRvIGJyZWFrIE9iamVjdC5rZXlzIHRocm91Z2ggc2NyZXd5IGFyZ3VtZW50cyBwYXNzaW5nLlxuICAvLyAgIENvbnZlcnRpbmcgdG8gYXJyYXkgc29sdmVzIHRoZSBwcm9ibGVtLlxuICBpZiAoaXNBcmd1bWVudHMoYSkpIHtcbiAgICBpZiAoIWlzQXJndW1lbnRzKGIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGEgPSBwU2xpY2UuY2FsbChhKTtcbiAgICBiID0gcFNsaWNlLmNhbGwoYik7XG4gICAgcmV0dXJuIGRlZXBFcXVhbChhLCBiLCBvcHRzKTtcbiAgfVxuICBpZiAoaXNCdWZmZXIoYSkpIHtcbiAgICBpZiAoIWlzQnVmZmVyKGIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFbaV0gIT09IGJbaV0pIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgdHJ5IHtcbiAgICB2YXIga2EgPSBvYmplY3RLZXlzKGEpLFxuICAgICAgICBrYiA9IG9iamVjdEtleXMoYik7XG4gIH0gY2F0Y2ggKGUpIHsvL2hhcHBlbnMgd2hlbiBvbmUgaXMgYSBzdHJpbmcgbGl0ZXJhbCBhbmQgdGhlIG90aGVyIGlzbid0XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoa2V5cyBpbmNvcnBvcmF0ZXNcbiAgLy8gaGFzT3duUHJvcGVydHkpXG4gIGlmIChrYS5sZW5ndGggIT0ga2IubGVuZ3RoKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy90aGUgc2FtZSBzZXQgb2Yga2V5cyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSxcbiAga2Euc29ydCgpO1xuICBrYi5zb3J0KCk7XG4gIC8vfn5+Y2hlYXAga2V5IHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoa2FbaV0gIT0ga2JbaV0pXG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy9lcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnkgY29ycmVzcG9uZGluZyBrZXksIGFuZFxuICAvL35+fnBvc3NpYmx5IGV4cGVuc2l2ZSBkZWVwIHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBrZXkgPSBrYVtpXTtcbiAgICBpZiAoIWRlZXBFcXVhbChhW2tleV0sIGJba2V5XSwgb3B0cykpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHlwZW9mIGEgPT09IHR5cGVvZiBiO1xufVxuIiwiLypcbiAqIERhdGUgRm9ybWF0IDEuMi4zXG4gKiAoYykgMjAwNy0yMDA5IFN0ZXZlbiBMZXZpdGhhbiA8c3RldmVubGV2aXRoYW4uY29tPlxuICogTUlUIGxpY2Vuc2VcbiAqXG4gKiBJbmNsdWRlcyBlbmhhbmNlbWVudHMgYnkgU2NvdHQgVHJlbmRhIDxzY290dC50cmVuZGEubmV0PlxuICogYW5kIEtyaXMgS293YWwgPGNpeGFyLmNvbS9+a3Jpcy5rb3dhbC8+XG4gKlxuICogQWNjZXB0cyBhIGRhdGUsIGEgbWFzaywgb3IgYSBkYXRlIGFuZCBhIG1hc2suXG4gKiBSZXR1cm5zIGEgZm9ybWF0dGVkIHZlcnNpb24gb2YgdGhlIGdpdmVuIGRhdGUuXG4gKiBUaGUgZGF0ZSBkZWZhdWx0cyB0byB0aGUgY3VycmVudCBkYXRlL3RpbWUuXG4gKiBUaGUgbWFzayBkZWZhdWx0cyB0byBkYXRlRm9ybWF0Lm1hc2tzLmRlZmF1bHQuXG4gKi9cblxuKGZ1bmN0aW9uKGdsb2JhbCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIGRhdGVGb3JtYXQgPSAoZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgdG9rZW4gPSAvZHsxLDR9fG17MSw0fXx5eSg/Onl5KT98KFtIaE1zVHRdKVxcMT98W0xsb1NaV05dfFwiW15cIl0qXCJ8J1teJ10qJy9nO1xuICAgICAgdmFyIHRpbWV6b25lID0gL1xcYig/OltQTUNFQV1bU0RQXVR8KD86UGFjaWZpY3xNb3VudGFpbnxDZW50cmFsfEVhc3Rlcm58QXRsYW50aWMpICg/OlN0YW5kYXJkfERheWxpZ2h0fFByZXZhaWxpbmcpIFRpbWV8KD86R01UfFVUQykoPzpbLStdXFxkezR9KT8pXFxiL2c7XG4gICAgICB2YXIgdGltZXpvbmVDbGlwID0gL1teLStcXGRBLVpdL2c7XG4gIFxuICAgICAgLy8gUmVnZXhlcyBhbmQgc3VwcG9ydGluZyBmdW5jdGlvbnMgYXJlIGNhY2hlZCB0aHJvdWdoIGNsb3N1cmVcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZGF0ZSwgbWFzaywgdXRjLCBnbXQpIHtcbiAgXG4gICAgICAgIC8vIFlvdSBjYW4ndCBwcm92aWRlIHV0YyBpZiB5b3Ugc2tpcCBvdGhlciBhcmdzICh1c2UgdGhlICdVVEM6JyBtYXNrIHByZWZpeClcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEgJiYga2luZE9mKGRhdGUpID09PSAnc3RyaW5nJyAmJiAhL1xcZC8udGVzdChkYXRlKSkge1xuICAgICAgICAgIG1hc2sgPSBkYXRlO1xuICAgICAgICAgIGRhdGUgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGRhdGUgPSBkYXRlIHx8IG5ldyBEYXRlO1xuICBcbiAgICAgICAgaWYoIShkYXRlIGluc3RhbmNlb2YgRGF0ZSkpIHtcbiAgICAgICAgICBkYXRlID0gbmV3IERhdGUoZGF0ZSk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIGlmIChpc05hTihkYXRlKSkge1xuICAgICAgICAgIHRocm93IFR5cGVFcnJvcignSW52YWxpZCBkYXRlJyk7XG4gICAgICAgIH1cbiAgXG4gICAgICAgIG1hc2sgPSBTdHJpbmcoZGF0ZUZvcm1hdC5tYXNrc1ttYXNrXSB8fCBtYXNrIHx8IGRhdGVGb3JtYXQubWFza3NbJ2RlZmF1bHQnXSk7XG4gIFxuICAgICAgICAvLyBBbGxvdyBzZXR0aW5nIHRoZSB1dGMvZ210IGFyZ3VtZW50IHZpYSB0aGUgbWFza1xuICAgICAgICB2YXIgbWFza1NsaWNlID0gbWFzay5zbGljZSgwLCA0KTtcbiAgICAgICAgaWYgKG1hc2tTbGljZSA9PT0gJ1VUQzonIHx8IG1hc2tTbGljZSA9PT0gJ0dNVDonKSB7XG4gICAgICAgICAgbWFzayA9IG1hc2suc2xpY2UoNCk7XG4gICAgICAgICAgdXRjID0gdHJ1ZTtcbiAgICAgICAgICBpZiAobWFza1NsaWNlID09PSAnR01UOicpIHtcbiAgICAgICAgICAgIGdtdCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gIFxuICAgICAgICB2YXIgXyA9IHV0YyA/ICdnZXRVVEMnIDogJ2dldCc7XG4gICAgICAgIHZhciBkID0gZGF0ZVtfICsgJ0RhdGUnXSgpO1xuICAgICAgICB2YXIgRCA9IGRhdGVbXyArICdEYXknXSgpO1xuICAgICAgICB2YXIgbSA9IGRhdGVbXyArICdNb250aCddKCk7XG4gICAgICAgIHZhciB5ID0gZGF0ZVtfICsgJ0Z1bGxZZWFyJ10oKTtcbiAgICAgICAgdmFyIEggPSBkYXRlW18gKyAnSG91cnMnXSgpO1xuICAgICAgICB2YXIgTSA9IGRhdGVbXyArICdNaW51dGVzJ10oKTtcbiAgICAgICAgdmFyIHMgPSBkYXRlW18gKyAnU2Vjb25kcyddKCk7XG4gICAgICAgIHZhciBMID0gZGF0ZVtfICsgJ01pbGxpc2Vjb25kcyddKCk7XG4gICAgICAgIHZhciBvID0gdXRjID8gMCA6IGRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTtcbiAgICAgICAgdmFyIFcgPSBnZXRXZWVrKGRhdGUpO1xuICAgICAgICB2YXIgTiA9IGdldERheU9mV2VlayhkYXRlKTtcbiAgICAgICAgdmFyIGZsYWdzID0ge1xuICAgICAgICAgIGQ6ICAgIGQsXG4gICAgICAgICAgZGQ6ICAgcGFkKGQpLFxuICAgICAgICAgIGRkZDogIGRhdGVGb3JtYXQuaTE4bi5kYXlOYW1lc1tEXSxcbiAgICAgICAgICBkZGRkOiBkYXRlRm9ybWF0LmkxOG4uZGF5TmFtZXNbRCArIDddLFxuICAgICAgICAgIG06ICAgIG0gKyAxLFxuICAgICAgICAgIG1tOiAgIHBhZChtICsgMSksXG4gICAgICAgICAgbW1tOiAgZGF0ZUZvcm1hdC5pMThuLm1vbnRoTmFtZXNbbV0sXG4gICAgICAgICAgbW1tbTogZGF0ZUZvcm1hdC5pMThuLm1vbnRoTmFtZXNbbSArIDEyXSxcbiAgICAgICAgICB5eTogICBTdHJpbmcoeSkuc2xpY2UoMiksXG4gICAgICAgICAgeXl5eTogeSxcbiAgICAgICAgICBoOiAgICBIICUgMTIgfHwgMTIsXG4gICAgICAgICAgaGg6ICAgcGFkKEggJSAxMiB8fCAxMiksXG4gICAgICAgICAgSDogICAgSCxcbiAgICAgICAgICBISDogICBwYWQoSCksXG4gICAgICAgICAgTTogICAgTSxcbiAgICAgICAgICBNTTogICBwYWQoTSksXG4gICAgICAgICAgczogICAgcyxcbiAgICAgICAgICBzczogICBwYWQocyksXG4gICAgICAgICAgbDogICAgcGFkKEwsIDMpLFxuICAgICAgICAgIEw6ICAgIHBhZChNYXRoLnJvdW5kKEwgLyAxMCkpLFxuICAgICAgICAgIHQ6ICAgIEggPCAxMiA/IGRhdGVGb3JtYXQuaTE4bi50aW1lTmFtZXNbMF0gOiBkYXRlRm9ybWF0LmkxOG4udGltZU5hbWVzWzFdLFxuICAgICAgICAgIHR0OiAgIEggPCAxMiA/IGRhdGVGb3JtYXQuaTE4bi50aW1lTmFtZXNbMl0gOiBkYXRlRm9ybWF0LmkxOG4udGltZU5hbWVzWzNdLFxuICAgICAgICAgIFQ6ICAgIEggPCAxMiA/IGRhdGVGb3JtYXQuaTE4bi50aW1lTmFtZXNbNF0gOiBkYXRlRm9ybWF0LmkxOG4udGltZU5hbWVzWzVdLFxuICAgICAgICAgIFRUOiAgIEggPCAxMiA/IGRhdGVGb3JtYXQuaTE4bi50aW1lTmFtZXNbNl0gOiBkYXRlRm9ybWF0LmkxOG4udGltZU5hbWVzWzddLFxuICAgICAgICAgIFo6ICAgIGdtdCA/ICdHTVQnIDogdXRjID8gJ1VUQycgOiAoU3RyaW5nKGRhdGUpLm1hdGNoKHRpbWV6b25lKSB8fCBbJyddKS5wb3AoKS5yZXBsYWNlKHRpbWV6b25lQ2xpcCwgJycpLFxuICAgICAgICAgIG86ICAgIChvID4gMCA/ICctJyA6ICcrJykgKyBwYWQoTWF0aC5mbG9vcihNYXRoLmFicyhvKSAvIDYwKSAqIDEwMCArIE1hdGguYWJzKG8pICUgNjAsIDQpLFxuICAgICAgICAgIFM6ICAgIFsndGgnLCAnc3QnLCAnbmQnLCAncmQnXVtkICUgMTAgPiAzID8gMCA6IChkICUgMTAwIC0gZCAlIDEwICE9IDEwKSAqIGQgJSAxMF0sXG4gICAgICAgICAgVzogICAgVyxcbiAgICAgICAgICBOOiAgICBOXG4gICAgICAgIH07XG4gIFxuICAgICAgICByZXR1cm4gbWFzay5yZXBsYWNlKHRva2VuLCBmdW5jdGlvbiAobWF0Y2gpIHtcbiAgICAgICAgICBpZiAobWF0Y2ggaW4gZmxhZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiBmbGFnc1ttYXRjaF07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtYXRjaC5zbGljZSgxLCBtYXRjaC5sZW5ndGggLSAxKTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgIH0pKCk7XG5cbiAgZGF0ZUZvcm1hdC5tYXNrcyA9IHtcbiAgICAnZGVmYXVsdCc6ICAgICAgICAgICAgICAgJ2RkZCBtbW0gZGQgeXl5eSBISDpNTTpzcycsXG4gICAgJ3Nob3J0RGF0ZSc6ICAgICAgICAgICAgICdtL2QveXknLFxuICAgICdtZWRpdW1EYXRlJzogICAgICAgICAgICAnbW1tIGQsIHl5eXknLFxuICAgICdsb25nRGF0ZSc6ICAgICAgICAgICAgICAnbW1tbSBkLCB5eXl5JyxcbiAgICAnZnVsbERhdGUnOiAgICAgICAgICAgICAgJ2RkZGQsIG1tbW0gZCwgeXl5eScsXG4gICAgJ3Nob3J0VGltZSc6ICAgICAgICAgICAgICdoOk1NIFRUJyxcbiAgICAnbWVkaXVtVGltZSc6ICAgICAgICAgICAgJ2g6TU06c3MgVFQnLFxuICAgICdsb25nVGltZSc6ICAgICAgICAgICAgICAnaDpNTTpzcyBUVCBaJyxcbiAgICAnaXNvRGF0ZSc6ICAgICAgICAgICAgICAgJ3l5eXktbW0tZGQnLFxuICAgICdpc29UaW1lJzogICAgICAgICAgICAgICAnSEg6TU06c3MnLFxuICAgICdpc29EYXRlVGltZSc6ICAgICAgICAgICAneXl5eS1tbS1kZFxcJ1RcXCdISDpNTTpzc28nLFxuICAgICdpc29VdGNEYXRlVGltZSc6ICAgICAgICAnVVRDOnl5eXktbW0tZGRcXCdUXFwnSEg6TU06c3NcXCdaXFwnJyxcbiAgICAnZXhwaXJlc0hlYWRlckZvcm1hdCc6ICAgJ2RkZCwgZGQgbW1tIHl5eXkgSEg6TU06c3MgWidcbiAgfTtcblxuICAvLyBJbnRlcm5hdGlvbmFsaXphdGlvbiBzdHJpbmdzXG4gIGRhdGVGb3JtYXQuaTE4biA9IHtcbiAgICBkYXlOYW1lczogW1xuICAgICAgJ1N1bicsICdNb24nLCAnVHVlJywgJ1dlZCcsICdUaHUnLCAnRnJpJywgJ1NhdCcsXG4gICAgICAnU3VuZGF5JywgJ01vbmRheScsICdUdWVzZGF5JywgJ1dlZG5lc2RheScsICdUaHVyc2RheScsICdGcmlkYXknLCAnU2F0dXJkYXknXG4gICAgXSxcbiAgICBtb250aE5hbWVzOiBbXG4gICAgICAnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLCAnT2N0JywgJ05vdicsICdEZWMnLFxuICAgICAgJ0phbnVhcnknLCAnRmVicnVhcnknLCAnTWFyY2gnLCAnQXByaWwnLCAnTWF5JywgJ0p1bmUnLCAnSnVseScsICdBdWd1c3QnLCAnU2VwdGVtYmVyJywgJ09jdG9iZXInLCAnTm92ZW1iZXInLCAnRGVjZW1iZXInXG4gICAgXSxcbiAgICB0aW1lTmFtZXM6IFtcbiAgICAgICdhJywgJ3AnLCAnYW0nLCAncG0nLCAnQScsICdQJywgJ0FNJywgJ1BNJ1xuICAgIF1cbiAgfTtcblxuZnVuY3Rpb24gcGFkKHZhbCwgbGVuKSB7XG4gIHZhbCA9IFN0cmluZyh2YWwpO1xuICBsZW4gPSBsZW4gfHwgMjtcbiAgd2hpbGUgKHZhbC5sZW5ndGggPCBsZW4pIHtcbiAgICB2YWwgPSAnMCcgKyB2YWw7XG4gIH1cbiAgcmV0dXJuIHZhbDtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIElTTyA4NjAxIHdlZWsgbnVtYmVyXG4gKiBCYXNlZCBvbiBjb21tZW50cyBmcm9tXG4gKiBodHRwOi8vdGVjaGJsb2cucHJvY3VyaW9zLm5sL2svbjYxOC9uZXdzL3ZpZXcvMzM3OTYvMTQ4NjMvQ2FsY3VsYXRlLUlTTy04NjAxLXdlZWstYW5kLXllYXItaW4tamF2YXNjcmlwdC5odG1sXG4gKlxuICogQHBhcmFtICB7T2JqZWN0fSBgZGF0ZWBcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqL1xuZnVuY3Rpb24gZ2V0V2VlayhkYXRlKSB7XG4gIC8vIFJlbW92ZSB0aW1lIGNvbXBvbmVudHMgb2YgZGF0ZVxuICB2YXIgdGFyZ2V0VGh1cnNkYXkgPSBuZXcgRGF0ZShkYXRlLmdldEZ1bGxZZWFyKCksIGRhdGUuZ2V0TW9udGgoKSwgZGF0ZS5nZXREYXRlKCkpO1xuXG4gIC8vIENoYW5nZSBkYXRlIHRvIFRodXJzZGF5IHNhbWUgd2Vla1xuICB0YXJnZXRUaHVyc2RheS5zZXREYXRlKHRhcmdldFRodXJzZGF5LmdldERhdGUoKSAtICgodGFyZ2V0VGh1cnNkYXkuZ2V0RGF5KCkgKyA2KSAlIDcpICsgMyk7XG5cbiAgLy8gVGFrZSBKYW51YXJ5IDR0aCBhcyBpdCBpcyBhbHdheXMgaW4gd2VlayAxIChzZWUgSVNPIDg2MDEpXG4gIHZhciBmaXJzdFRodXJzZGF5ID0gbmV3IERhdGUodGFyZ2V0VGh1cnNkYXkuZ2V0RnVsbFllYXIoKSwgMCwgNCk7XG5cbiAgLy8gQ2hhbmdlIGRhdGUgdG8gVGh1cnNkYXkgc2FtZSB3ZWVrXG4gIGZpcnN0VGh1cnNkYXkuc2V0RGF0ZShmaXJzdFRodXJzZGF5LmdldERhdGUoKSAtICgoZmlyc3RUaHVyc2RheS5nZXREYXkoKSArIDYpICUgNykgKyAzKTtcblxuICAvLyBDaGVjayBpZiBkYXlsaWdodC1zYXZpbmctdGltZS1zd2l0Y2ggb2NjdXJyZWQgYW5kIGNvcnJlY3QgZm9yIGl0XG4gIHZhciBkcyA9IHRhcmdldFRodXJzZGF5LmdldFRpbWV6b25lT2Zmc2V0KCkgLSBmaXJzdFRodXJzZGF5LmdldFRpbWV6b25lT2Zmc2V0KCk7XG4gIHRhcmdldFRodXJzZGF5LnNldEhvdXJzKHRhcmdldFRodXJzZGF5LmdldEhvdXJzKCkgLSBkcyk7XG5cbiAgLy8gTnVtYmVyIG9mIHdlZWtzIGJldHdlZW4gdGFyZ2V0IFRodXJzZGF5IGFuZCBmaXJzdCBUaHVyc2RheVxuICB2YXIgd2Vla0RpZmYgPSAodGFyZ2V0VGh1cnNkYXkgLSBmaXJzdFRodXJzZGF5KSAvICg4NjQwMDAwMCo3KTtcbiAgcmV0dXJuIDEgKyBNYXRoLmZsb29yKHdlZWtEaWZmKTtcbn1cblxuLyoqXG4gKiBHZXQgSVNPLTg2MDEgbnVtZXJpYyByZXByZXNlbnRhdGlvbiBvZiB0aGUgZGF5IG9mIHRoZSB3ZWVrXG4gKiAxIChmb3IgTW9uZGF5KSB0aHJvdWdoIDcgKGZvciBTdW5kYXkpXG4gKiBcbiAqIEBwYXJhbSAge09iamVjdH0gYGRhdGVgXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGdldERheU9mV2VlayhkYXRlKSB7XG4gIHZhciBkb3cgPSBkYXRlLmdldERheSgpO1xuICBpZihkb3cgPT09IDApIHtcbiAgICBkb3cgPSA3O1xuICB9XG4gIHJldHVybiBkb3c7XG59XG5cbi8qKlxuICoga2luZC1vZiBzaG9ydGN1dFxuICogQHBhcmFtICB7Kn0gdmFsXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGtpbmRPZih2YWwpIHtcbiAgaWYgKHZhbCA9PT0gbnVsbCkge1xuICAgIHJldHVybiAnbnVsbCc7XG4gIH1cblxuICBpZiAodmFsID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gJ3VuZGVmaW5lZCc7XG4gIH1cblxuICBpZiAodHlwZW9mIHZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbDtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcbiAgICByZXR1cm4gJ2FycmF5JztcbiAgfVxuXG4gIHJldHVybiB7fS50b1N0cmluZy5jYWxsKHZhbClcbiAgICAuc2xpY2UoOCwgLTEpLnRvTG93ZXJDYXNlKCk7XG59O1xuXG5cblxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBkYXRlRm9ybWF0O1xuICAgIH0pO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZGF0ZUZvcm1hdDtcbiAgfSBlbHNlIHtcbiAgICBnbG9iYWwuZGF0ZUZvcm1hdCA9IGRhdGVGb3JtYXQ7XG4gIH1cbn0pKHRoaXMpO1xuIiwiLyohXG4gKiByZXBlYXQtc3RyaW5nIDxodHRwczovL2dpdGh1Yi5jb20vam9uc2NobGlua2VydC9yZXBlYXQtc3RyaW5nPlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE1LCBKb24gU2NobGlua2VydC5cbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbi8qKlxuICogUmVzdWx0cyBjYWNoZVxuICovXG5cbnZhciByZXMgPSAnJztcbnZhciBjYWNoZTtcblxuLyoqXG4gKiBFeHBvc2UgYHJlcGVhdGBcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcGVhdDtcblxuLyoqXG4gKiBSZXBlYXQgdGhlIGdpdmVuIGBzdHJpbmdgIHRoZSBzcGVjaWZpZWQgYG51bWJlcmBcbiAqIG9mIHRpbWVzLlxuICpcbiAqICoqRXhhbXBsZToqKlxuICpcbiAqIGBgYGpzXG4gKiB2YXIgcmVwZWF0ID0gcmVxdWlyZSgncmVwZWF0LXN0cmluZycpO1xuICogcmVwZWF0KCdBJywgNSk7XG4gKiAvLz0+IEFBQUFBXG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYHN0cmluZ2AgVGhlIHN0cmluZyB0byByZXBlYXRcbiAqIEBwYXJhbSB7TnVtYmVyfSBgbnVtYmVyYCBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIHJlcGVhdCB0aGUgc3RyaW5nXG4gKiBAcmV0dXJuIHtTdHJpbmd9IFJlcGVhdGVkIHN0cmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiByZXBlYXQoc3RyLCBudW0pIHtcbiAgaWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZXhwZWN0ZWQgYSBzdHJpbmcnKTtcbiAgfVxuXG4gIC8vIGNvdmVyIGNvbW1vbiwgcXVpY2sgdXNlIGNhc2VzXG4gIGlmIChudW0gPT09IDEpIHJldHVybiBzdHI7XG4gIGlmIChudW0gPT09IDIpIHJldHVybiBzdHIgKyBzdHI7XG5cbiAgdmFyIG1heCA9IHN0ci5sZW5ndGggKiBudW07XG4gIGlmIChjYWNoZSAhPT0gc3RyIHx8IHR5cGVvZiBjYWNoZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBjYWNoZSA9IHN0cjtcbiAgICByZXMgPSAnJztcbiAgfSBlbHNlIGlmIChyZXMubGVuZ3RoID49IG1heCkge1xuICAgIHJldHVybiByZXMuc3Vic3RyKDAsIG1heCk7XG4gIH1cblxuICB3aGlsZSAobWF4ID4gcmVzLmxlbmd0aCAmJiBudW0gPiAxKSB7XG4gICAgaWYgKG51bSAmIDEpIHtcbiAgICAgIHJlcyArPSBzdHI7XG4gICAgfVxuXG4gICAgbnVtID4+PSAxO1xuICAgIHN0ciArPSBzdHI7XG4gIH1cblxuICByZXMgKz0gc3RyO1xuICByZXMgPSByZXMuc3Vic3RyKDAsIG1heCk7XG4gIHJldHVybiByZXM7XG59XG4iLCIvKiFcbiAqIHBhZC1sZWZ0IDxodHRwczovL2dpdGh1Yi5jb20vam9uc2NobGlua2VydC9wYWQtbGVmdD5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNSwgSm9uIFNjaGxpbmtlcnQuXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVwZWF0ID0gcmVxdWlyZSgncmVwZWF0LXN0cmluZycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHBhZExlZnQoc3RyLCBudW0sIGNoKSB7XG4gIHN0ciA9IHN0ci50b1N0cmluZygpO1xuXG4gIGlmICh0eXBlb2YgbnVtID09PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBzdHI7XG4gIH1cblxuICBpZiAoY2ggPT09IDApIHtcbiAgICBjaCA9ICcwJztcbiAgfSBlbHNlIGlmIChjaCkge1xuICAgIGNoID0gY2gudG9TdHJpbmcoKTtcbiAgfSBlbHNlIHtcbiAgICBjaCA9ICcgJztcbiAgfVxuXG4gIHJldHVybiByZXBlYXQoY2gsIG51bSAtIHN0ci5sZW5ndGgpICsgc3RyO1xufTtcbiIsImltcG9ydCBkYXRlZm9ybWF0IGZyb20gJ2RhdGVmb3JtYXQnO1xuaW1wb3J0IGFzc2lnbiBmcm9tICdvYmplY3QtYXNzaWduJztcbmltcG9ydCBwYWRMZWZ0IGZyb20gJ3BhZC1sZWZ0JztcbmltcG9ydCB7IGdldENsaWVudEFQSSB9IGZyb20gJy4vdXRpbCc7XG5cbmNvbnN0IG5vb3AgPSAoKSA9PiB7fTtcbmxldCBsaW5rO1xubGV0IGRlZmF1bHRFeHRzID0geyBleHRlbnNpb246ICcnLCBwcmVmaXg6ICcnLCBzdWZmaXg6ICcnIH07XG5cbi8vIEFsdGVybmF0aXZlIHNvbHV0aW9uIGZvciBzYXZpbmcgZmlsZXMsXG4vLyBhIGJpdCBzbG93ZXIgYW5kIGRvZXMgbm90IHdvcmsgaW4gU2FmYXJpXG4vLyBmdW5jdGlvbiBmZXRjaEJsb2JGcm9tRGF0YVVSTCAoZGF0YVVSTCkge1xuLy8gICByZXR1cm4gd2luZG93LmZldGNoKGRhdGFVUkwpLnRoZW4ocmVzID0+IHJlcy5ibG9iKCkpO1xuLy8gfVxuXG5jb25zdCBzdXBwb3J0ZWRFbmNvZGluZ3MgPSBbXG4gICdpbWFnZS9wbmcnLFxuICAnaW1hZ2UvanBlZycsXG4gICdpbWFnZS93ZWJwJ1xuXTtcblxuZnVuY3Rpb24gc3RyZWFtIChpc1N0YXJ0LCBvcHRzID0ge30pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBvcHRzID0gYXNzaWduKHt9LCBkZWZhdWx0RXh0cywgb3B0cyk7XG4gICAgY29uc3QgZmlsZW5hbWUgPSByZXNvbHZlRmlsZW5hbWUoT2JqZWN0LmFzc2lnbih7fSwgb3B0cywge1xuICAgICAgZXh0ZW5zaW9uOiAnJyxcbiAgICAgIGZyYW1lOiB1bmRlZmluZWRcbiAgICB9KSk7XG4gICAgY29uc3QgZnVuYyA9IGlzU3RhcnQgPyAnc3RyZWFtU3RhcnQnIDogJ3N0cmVhbUVuZCc7XG4gICAgY29uc3QgY2xpZW50ID0gZ2V0Q2xpZW50QVBJKCk7XG4gICAgaWYgKGNsaWVudCAmJiBjbGllbnQub3V0cHV0ICYmIHR5cGVvZiBjbGllbnRbZnVuY10gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBjbGllbnRbZnVuY10oYXNzaWduKHt9LCBvcHRzLCB7IGZpbGVuYW1lIH0pKVxuICAgICAgICAudGhlbihldiA9PiByZXNvbHZlKGV2KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiByZXNvbHZlKHsgZmlsZW5hbWUsIGNsaWVudDogZmFsc2UgfSk7XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmVhbVN0YXJ0IChvcHRzID0ge30pIHtcbiAgcmV0dXJuIHN0cmVhbSh0cnVlLCBvcHRzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmVhbUVuZCAob3B0cyA9IHt9KSB7XG4gIHJldHVybiBzdHJlYW0oZmFsc2UsIG9wdHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Q2FudmFzIChjYW52YXMsIG9wdCA9IHt9KSB7XG4gIGNvbnN0IGVuY29kaW5nID0gb3B0LmVuY29kaW5nIHx8ICdpbWFnZS9wbmcnO1xuICBpZiAoIXN1cHBvcnRlZEVuY29kaW5ncy5pbmNsdWRlcyhlbmNvZGluZykpIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBjYW52YXMgZW5jb2RpbmcgJHtlbmNvZGluZ31gKTtcbiAgbGV0IGV4dGVuc2lvbiA9IChlbmNvZGluZy5zcGxpdCgnLycpWzFdIHx8ICcnKS5yZXBsYWNlKC9qcGVnL2ksICdqcGcnKTtcbiAgaWYgKGV4dGVuc2lvbikgZXh0ZW5zaW9uID0gYC4ke2V4dGVuc2lvbn1gLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiB7XG4gICAgZXh0ZW5zaW9uLFxuICAgIHR5cGU6IGVuY29kaW5nLFxuICAgIGRhdGFVUkw6IGNhbnZhcy50b0RhdGFVUkwoZW5jb2RpbmcsIG9wdC5lbmNvZGluZ1F1YWxpdHkpXG4gIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJsb2JGcm9tRGF0YVVSTCAoZGF0YVVSTCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCBzcGxpdEluZGV4ID0gZGF0YVVSTC5pbmRleE9mKCcsJyk7XG4gICAgaWYgKHNwbGl0SW5kZXggPT09IC0xKSB7XG4gICAgICByZXNvbHZlKG5ldyB3aW5kb3cuQmxvYigpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgYmFzZTY0ID0gZGF0YVVSTC5zbGljZShzcGxpdEluZGV4ICsgMSk7XG4gICAgY29uc3QgYnl0ZVN0cmluZyA9IHdpbmRvdy5hdG9iKGJhc2U2NCk7XG4gICAgY29uc3QgdHlwZSA9IGRhdGFVUkwuc2xpY2UoMCwgc3BsaXRJbmRleCk7XG4gICAgY29uc3QgbWltZU1hdGNoID0gL2RhdGE6KFteO10rKS8uZXhlYyh0eXBlKTtcbiAgICBjb25zdCBtaW1lID0gKG1pbWVNYXRjaCA/IG1pbWVNYXRjaFsxXSA6ICcnKSB8fCB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWIgPSBuZXcgQXJyYXlCdWZmZXIoYnl0ZVN0cmluZy5sZW5ndGgpO1xuICAgIGNvbnN0IGlhID0gbmV3IFVpbnQ4QXJyYXkoYWIpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZVN0cmluZy5sZW5ndGg7IGkrKykge1xuICAgICAgaWFbaV0gPSBieXRlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG4gICAgfVxuICAgIHJlc29sdmUobmV3IHdpbmRvdy5CbG9iKFsgYWIgXSwgeyB0eXBlOiBtaW1lIH0pKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlRGF0YVVSTCAoZGF0YVVSTCwgb3B0cyA9IHt9KSB7XG4gIHJldHVybiBjcmVhdGVCbG9iRnJvbURhdGFVUkwoZGF0YVVSTClcbiAgICAudGhlbihibG9iID0+IHNhdmVCbG9iKGJsb2IsIG9wdHMpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVCbG9iIChibG9iLCBvcHRzID0ge30pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgIG9wdHMgPSBhc3NpZ24oe30sIGRlZmF1bHRFeHRzLCBvcHRzKTtcbiAgICBjb25zdCBmaWxlbmFtZSA9IG9wdHMuZmlsZW5hbWU7XG5cbiAgICBjb25zdCBjbGllbnQgPSBnZXRDbGllbnRBUEkoKTtcbiAgICBpZiAoY2xpZW50ICYmIHR5cGVvZiBjbGllbnQuc2F2ZUJsb2IgPT09ICdmdW5jdGlvbicgJiYgY2xpZW50Lm91dHB1dCkge1xuICAgICAgLy8gbmF0aXZlIHNhdmluZyB1c2luZyBhIENMSSB0b29sXG4gICAgICByZXR1cm4gY2xpZW50LnNhdmVCbG9iKGJsb2IsIGFzc2lnbih7fSwgb3B0cywgeyBmaWxlbmFtZSB9KSlcbiAgICAgICAgLnRoZW4oZXYgPT4gcmVzb2x2ZShldikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBmb3JjZSBkb3dubG9hZFxuICAgICAgaWYgKCFsaW5rKSB7XG4gICAgICAgIGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGxpbmsuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuICAgICAgICBsaW5rLnRhcmdldCA9ICdfYmxhbmsnO1xuICAgICAgfVxuICAgICAgbGluay5kb3dubG9hZCA9IGZpbGVuYW1lO1xuICAgICAgbGluay5ocmVmID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxpbmspO1xuICAgICAgbGluay5vbmNsaWNrID0gKCkgPT4ge1xuICAgICAgICBsaW5rLm9uY2xpY2sgPSBub29wO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB3aW5kb3cuVVJMLnJldm9rZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgICBpZiAobGluay5wYXJlbnRFbGVtZW50KSBsaW5rLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQobGluayk7XG4gICAgICAgICAgbGluay5yZW1vdmVBdHRyaWJ1dGUoJ2hyZWYnKTtcbiAgICAgICAgICByZXNvbHZlKHsgZmlsZW5hbWUsIGNsaWVudDogZmFsc2UgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGxpbmsuY2xpY2soKTtcbiAgICB9XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZUZpbGUgKGRhdGEsIG9wdHMgPSB7fSkge1xuICBjb25zdCBwYXJ0cyA9IEFycmF5LmlzQXJyYXkoZGF0YSkgPyBkYXRhIDogWyBkYXRhIF07XG4gIGNvbnN0IGJsb2IgPSBuZXcgd2luZG93LkJsb2IocGFydHMsIHsgdHlwZTogb3B0cy50eXBlIHx8ICcnIH0pO1xuICByZXR1cm4gc2F2ZUJsb2IoYmxvYiwgb3B0cyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUaW1lU3RhbXAgKCkge1xuICBjb25zdCBkYXRlRm9ybWF0U3RyID0gYHl5eXkubW0uZGQtSEguTU0uc3NgO1xuICByZXR1cm4gZGF0ZWZvcm1hdChuZXcgRGF0ZSgpLCBkYXRlRm9ybWF0U3RyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHRGaWxlIChwcmVmaXggPSAnJywgc3VmZml4ID0gJycsIGV4dCkge1xuICAvLyBjb25zdCBkYXRlRm9ybWF0U3RyID0gYHl5eXkubW0uZGQtSEguTU0uc3NgO1xuICBjb25zdCBkYXRlRm9ybWF0U3RyID0gYHl5eXktbW0tZGQgJ2F0JyBoLk1NLnNzIFRUYDtcbiAgcmV0dXJuIGAke3ByZWZpeH0ke2RhdGVmb3JtYXQobmV3IERhdGUoKSwgZGF0ZUZvcm1hdFN0cil9JHtzdWZmaXh9JHtleHR9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVGaWxlbmFtZSAob3B0ID0ge30pIHtcbiAgb3B0ID0gYXNzaWduKHt9LCBvcHQpO1xuXG4gIC8vIEN1c3RvbSBmaWxlbmFtZSBmdW5jdGlvblxuICBpZiAodHlwZW9mIG9wdC5maWxlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIG9wdC5maWxlKG9wdCk7XG4gIH0gZWxzZSBpZiAob3B0LmZpbGUpIHtcbiAgICByZXR1cm4gb3B0LmZpbGU7XG4gIH1cblxuICBsZXQgZnJhbWUgPSBudWxsO1xuICBsZXQgZXh0ZW5zaW9uID0gJyc7XG4gIGlmICh0eXBlb2Ygb3B0LmV4dGVuc2lvbiA9PT0gJ3N0cmluZycpIGV4dGVuc2lvbiA9IG9wdC5leHRlbnNpb247XG5cbiAgaWYgKHR5cGVvZiBvcHQuZnJhbWUgPT09ICdudW1iZXInKSB7XG4gICAgbGV0IHRvdGFsRnJhbWVzO1xuICAgIGlmICh0eXBlb2Ygb3B0LnRvdGFsRnJhbWVzID09PSAnbnVtYmVyJykge1xuICAgICAgdG90YWxGcmFtZXMgPSBvcHQudG90YWxGcmFtZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRvdGFsRnJhbWVzID0gTWF0aC5tYXgoMTAwMDAsIG9wdC5mcmFtZSk7XG4gICAgfVxuICAgIGZyYW1lID0gcGFkTGVmdChTdHJpbmcob3B0LmZyYW1lKSwgU3RyaW5nKHRvdGFsRnJhbWVzKS5sZW5ndGgsICcwJyk7XG4gIH1cblxuICBjb25zdCBsYXllclN0ciA9IGlzRmluaXRlKG9wdC50b3RhbExheWVycykgJiYgaXNGaW5pdGUob3B0LmxheWVyKSAmJiBvcHQudG90YWxMYXllcnMgPiAxID8gYCR7b3B0LmxheWVyfWAgOiAnJztcbiAgaWYgKGZyYW1lICE9IG51bGwpIHtcbiAgICByZXR1cm4gWyBsYXllclN0ciwgZnJhbWUgXS5maWx0ZXIoQm9vbGVhbikuam9pbignLScpICsgZXh0ZW5zaW9uO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRlZmF1bHRGaWxlTmFtZSA9IG9wdC50aW1lU3RhbXA7XG4gICAgcmV0dXJuIFsgb3B0LnByZWZpeCwgb3B0Lm5hbWUgfHwgZGVmYXVsdEZpbGVOYW1lLCBsYXllclN0ciwgb3B0Lmhhc2gsIG9wdC5zdWZmaXggXS5maWx0ZXIoQm9vbGVhbikuam9pbignLScpICsgZXh0ZW5zaW9uO1xuICB9XG59XG4iLCIvLyBIYW5kbGUgc29tZSBjb21tb24gdHlwb3NcbmNvbnN0IGNvbW1vblR5cG9zID0ge1xuICBkaW1lbnNpb246ICdkaW1lbnNpb25zJyxcbiAgYW5pbWF0ZWQ6ICdhbmltYXRlJyxcbiAgYW5pbWF0aW5nOiAnYW5pbWF0ZScsXG4gIHVuaXQ6ICd1bml0cycsXG4gIFA1OiAncDUnLFxuICBwaXhlbGxhdGVkOiAncGl4ZWxhdGVkJyxcbiAgbG9vcGluZzogJ2xvb3AnLFxuICBwaXhlbFBlckluY2g6ICdwaXhlbHMnXG59O1xuXG4vLyBIYW5kbGUgYWxsIG90aGVyIHR5cG9zXG5jb25zdCBhbGxLZXlzID0gW1xuICAnZGltZW5zaW9ucycsICd1bml0cycsICdwaXhlbHNQZXJJbmNoJywgJ29yaWVudGF0aW9uJyxcbiAgJ3NjYWxlVG9GaXQnLCAnc2NhbGVUb1ZpZXcnLCAnYmxlZWQnLCAncGl4ZWxSYXRpbycsXG4gICdleHBvcnRQaXhlbFJhdGlvJywgJ21heFBpeGVsUmF0aW8nLCAnc2NhbGVDb250ZXh0JyxcbiAgJ3Jlc2l6ZUNhbnZhcycsICdzdHlsZUNhbnZhcycsICdjYW52YXMnLCAnY29udGV4dCcsICdhdHRyaWJ1dGVzJyxcbiAgJ3BhcmVudCcsICdmaWxlJywgJ25hbWUnLCAncHJlZml4JywgJ3N1ZmZpeCcsICdhbmltYXRlJywgJ3BsYXlpbmcnLFxuICAnbG9vcCcsICdkdXJhdGlvbicsICd0b3RhbEZyYW1lcycsICdmcHMnLCAncGxheWJhY2tSYXRlJywgJ3RpbWVTY2FsZScsXG4gICdmcmFtZScsICd0aW1lJywgJ2ZsdXNoJywgJ3BpeGVsYXRlZCcsICdob3RrZXlzJywgJ3A1JywgJ2lkJyxcbiAgJ3NjYWxlVG9GaXRQYWRkaW5nJywgJ2RhdGEnLCAncGFyYW1zJywgJ2VuY29kaW5nJywgJ2VuY29kaW5nUXVhbGl0eSdcbl07XG5cbi8vIFRoaXMgaXMgZmFpcmx5IG9waW5pb25hdGVkIGFuZCBmb3JjZXMgdXNlcnMgdG8gdXNlIHRoZSAnZGF0YScgcGFyYW1ldGVyXG4vLyBpZiB0aGV5IHdhbnQgdG8gcGFzcyBhbG9uZyBub24tc2V0dGluZyBvYmplY3RzLi4uXG5leHBvcnQgY29uc3QgY2hlY2tTZXR0aW5ncyA9IChzZXR0aW5ncykgPT4ge1xuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc2V0dGluZ3MpO1xuICBrZXlzLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoa2V5IGluIGNvbW1vblR5cG9zKSB7XG4gICAgICBjb25zdCBhY3R1YWwgPSBjb21tb25UeXBvc1trZXldO1xuICAgICAgY29uc29sZS53YXJuKGBbY2FudmFzLXNrZXRjaF0gQ291bGQgbm90IHJlY29nbml6ZSB0aGUgc2V0dGluZyBcIiR7a2V5fVwiLCBkaWQgeW91IG1lYW4gXCIke2FjdHVhbH1cIj9gKTtcbiAgICB9IGVsc2UgaWYgKCFhbGxLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIGNvbnNvbGUud2FybihgW2NhbnZhcy1za2V0Y2hdIENvdWxkIG5vdCByZWNvZ25pemUgdGhlIHNldHRpbmcgXCIke2tleX1cImApO1xuICAgIH1cbiAgfSk7XG59O1xuIiwiaW1wb3J0IHsgZ2V0Q2xpZW50QVBJIH0gZnJvbSAnLi4vdXRpbCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChvcHQgPSB7fSkge1xuICBjb25zdCBoYW5kbGVyID0gZXYgPT4ge1xuICAgIGlmICghb3B0LmVuYWJsZWQoKSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY2xpZW50ID0gZ2V0Q2xpZW50QVBJKCk7XG4gICAgaWYgKGV2LmtleUNvZGUgPT09IDgzICYmICFldi5hbHRLZXkgJiYgKGV2Lm1ldGFLZXkgfHwgZXYuY3RybEtleSkpIHtcbiAgICAgIC8vIENtZCArIFNcbiAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBvcHQuc2F2ZShldik7XG4gICAgfSBlbHNlIGlmIChldi5rZXlDb2RlID09PSAzMikge1xuICAgICAgLy8gU3BhY2VcbiAgICAgIC8vIFRPRE86IHdoYXQgdG8gZG8gd2l0aCB0aGlzPyBrZWVwIGl0LCBvciByZW1vdmUgaXQ/XG4gICAgICBvcHQudG9nZ2xlUGxheShldik7XG4gICAgfSBlbHNlIGlmIChjbGllbnQgJiYgIWV2LmFsdEtleSAmJiBldi5rZXlDb2RlID09PSA3NSAmJiAoZXYubWV0YUtleSB8fCBldi5jdHJsS2V5KSkge1xuICAgICAgLy8gQ21kICsgSywgb25seSB3aGVuIGNhbnZhcy1za2V0Y2gtY2xpIGlzIHVzZWRcbiAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBvcHQuY29tbWl0KGV2KTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgYXR0YWNoID0gKCkgPT4ge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlcik7XG4gIH07XG5cbiAgY29uc3QgZGV0YWNoID0gKCkgPT4ge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlcik7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBhdHRhY2gsXG4gICAgZGV0YWNoXG4gIH07XG59XG4iLCJjb25zdCBkZWZhdWx0VW5pdHMgPSAnbW0nO1xuXG5jb25zdCBkYXRhID0gW1xuICAvLyBDb21tb24gUGFwZXIgU2l6ZXNcbiAgLy8gKE1vc3RseSBOb3J0aC1BbWVyaWNhbiBiYXNlZClcbiAgWyAncG9zdGNhcmQnLCAxMDEuNiwgMTUyLjQgXSxcbiAgWyAncG9zdGVyLXNtYWxsJywgMjgwLCA0MzAgXSxcbiAgWyAncG9zdGVyJywgNDYwLCA2MTAgXSxcbiAgWyAncG9zdGVyLWxhcmdlJywgNjEwLCA5MTAgXSxcbiAgWyAnYnVzaW5lc3MtY2FyZCcsIDUwLjgsIDg4LjkgXSxcblxuICAvLyBQaG90b2dyYXBoaWMgUHJpbnQgUGFwZXIgU2l6ZXNcbiAgWyAnMnInLCA2NCwgODkgXSxcbiAgWyAnM3InLCA4OSwgMTI3IF0sXG4gIFsgJzRyJywgMTAyLCAxNTIgXSxcbiAgWyAnNXInLCAxMjcsIDE3OCBdLCAvLyA14oCzeDfigLNcbiAgWyAnNnInLCAxNTIsIDIwMyBdLCAvLyA24oCzeDjigLNcbiAgWyAnOHInLCAyMDMsIDI1NCBdLCAvLyA44oCzeDEw4oCzXG4gIFsgJzEwcicsIDI1NCwgMzA1IF0sIC8vIDEw4oCzeDEy4oCzXG4gIFsgJzExcicsIDI3OSwgMzU2IF0sIC8vIDEx4oCzeDE04oCzXG4gIFsgJzEycicsIDMwNSwgMzgxIF0sXG5cbiAgLy8gU3RhbmRhcmQgUGFwZXIgU2l6ZXNcbiAgWyAnYTAnLCA4NDEsIDExODkgXSxcbiAgWyAnYTEnLCA1OTQsIDg0MSBdLFxuICBbICdhMicsIDQyMCwgNTk0IF0sXG4gIFsgJ2EzJywgMjk3LCA0MjAgXSxcbiAgWyAnYTQnLCAyMTAsIDI5NyBdLFxuICBbICdhNScsIDE0OCwgMjEwIF0sXG4gIFsgJ2E2JywgMTA1LCAxNDggXSxcbiAgWyAnYTcnLCA3NCwgMTA1IF0sXG4gIFsgJ2E4JywgNTIsIDc0IF0sXG4gIFsgJ2E5JywgMzcsIDUyIF0sXG4gIFsgJ2ExMCcsIDI2LCAzNyBdLFxuICBbICcyYTAnLCAxMTg5LCAxNjgyIF0sXG4gIFsgJzRhMCcsIDE2ODIsIDIzNzggXSxcbiAgWyAnYjAnLCAxMDAwLCAxNDE0IF0sXG4gIFsgJ2IxJywgNzA3LCAxMDAwIF0sXG4gIFsgJ2IxKycsIDcyMCwgMTAyMCBdLFxuICBbICdiMicsIDUwMCwgNzA3IF0sXG4gIFsgJ2IyKycsIDUyMCwgNzIwIF0sXG4gIFsgJ2IzJywgMzUzLCA1MDAgXSxcbiAgWyAnYjQnLCAyNTAsIDM1MyBdLFxuICBbICdiNScsIDE3NiwgMjUwIF0sXG4gIFsgJ2I2JywgMTI1LCAxNzYgXSxcbiAgWyAnYjcnLCA4OCwgMTI1IF0sXG4gIFsgJ2I4JywgNjIsIDg4IF0sXG4gIFsgJ2I5JywgNDQsIDYyIF0sXG4gIFsgJ2IxMCcsIDMxLCA0NCBdLFxuICBbICdiMTEnLCAyMiwgMzIgXSxcbiAgWyAnYjEyJywgMTYsIDIyIF0sXG4gIFsgJ2MwJywgOTE3LCAxMjk3IF0sXG4gIFsgJ2MxJywgNjQ4LCA5MTcgXSxcbiAgWyAnYzInLCA0NTgsIDY0OCBdLFxuICBbICdjMycsIDMyNCwgNDU4IF0sXG4gIFsgJ2M0JywgMjI5LCAzMjQgXSxcbiAgWyAnYzUnLCAxNjIsIDIyOSBdLFxuICBbICdjNicsIDExNCwgMTYyIF0sXG4gIFsgJ2M3JywgODEsIDExNCBdLFxuICBbICdjOCcsIDU3LCA4MSBdLFxuICBbICdjOScsIDQwLCA1NyBdLFxuICBbICdjMTAnLCAyOCwgNDAgXSxcbiAgWyAnYzExJywgMjIsIDMyIF0sXG4gIFsgJ2MxMicsIDE2LCAyMiBdLFxuXG4gIC8vIFVzZSBpbmNoZXMgZm9yIE5vcnRoIEFtZXJpY2FuIHNpemVzLFxuICAvLyBhcyBpdCBwcm9kdWNlcyBsZXNzIGZsb2F0IHByZWNpc2lvbiBlcnJvcnNcbiAgWyAnaGFsZi1sZXR0ZXInLCA1LjUsIDguNSwgJ2luJyBdLFxuICBbICdsZXR0ZXInLCA4LjUsIDExLCAnaW4nIF0sXG4gIFsgJ2xlZ2FsJywgOC41LCAxNCwgJ2luJyBdLFxuICBbICdqdW5pb3ItbGVnYWwnLCA1LCA4LCAnaW4nIF0sXG4gIFsgJ2xlZGdlcicsIDExLCAxNywgJ2luJyBdLFxuICBbICd0YWJsb2lkJywgMTEsIDE3LCAnaW4nIF0sXG4gIFsgJ2Fuc2ktYScsIDguNSwgMTEuMCwgJ2luJyBdLFxuICBbICdhbnNpLWInLCAxMS4wLCAxNy4wLCAnaW4nIF0sXG4gIFsgJ2Fuc2ktYycsIDE3LjAsIDIyLjAsICdpbicgXSxcbiAgWyAnYW5zaS1kJywgMjIuMCwgMzQuMCwgJ2luJyBdLFxuICBbICdhbnNpLWUnLCAzNC4wLCA0NC4wLCAnaW4nIF0sXG4gIFsgJ2FyY2gtYScsIDksIDEyLCAnaW4nIF0sXG4gIFsgJ2FyY2gtYicsIDEyLCAxOCwgJ2luJyBdLFxuICBbICdhcmNoLWMnLCAxOCwgMjQsICdpbicgXSxcbiAgWyAnYXJjaC1kJywgMjQsIDM2LCAnaW4nIF0sXG4gIFsgJ2FyY2gtZScsIDM2LCA0OCwgJ2luJyBdLFxuICBbICdhcmNoLWUxJywgMzAsIDQyLCAnaW4nIF0sXG4gIFsgJ2FyY2gtZTInLCAyNiwgMzgsICdpbicgXSxcbiAgWyAnYXJjaC1lMycsIDI3LCAzOSwgJ2luJyBdXG5dO1xuXG5leHBvcnQgZGVmYXVsdCBkYXRhLnJlZHVjZSgoZGljdCwgcHJlc2V0KSA9PiB7XG4gIGNvbnN0IGl0ZW0gPSB7XG4gICAgdW5pdHM6IHByZXNldFszXSB8fCBkZWZhdWx0VW5pdHMsXG4gICAgZGltZW5zaW9uczogWyBwcmVzZXRbMV0sIHByZXNldFsyXSBdXG4gIH07XG4gIGRpY3RbcHJlc2V0WzBdXSA9IGl0ZW07XG4gIGRpY3RbcHJlc2V0WzBdLnJlcGxhY2UoLy0vZywgJyAnKV0gPSBpdGVtO1xuICByZXR1cm4gZGljdDtcbn0sIHt9KTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhcmd1bWVudHNbaV0gIT09IHVuZGVmaW5lZCkgcmV0dXJuIGFyZ3VtZW50c1tpXTtcbiAgICB9XG59O1xuIiwidmFyIGRlZmluZWQgPSByZXF1aXJlKCdkZWZpbmVkJyk7XG52YXIgdW5pdHMgPSBbICdtbScsICdjbScsICdtJywgJ3BjJywgJ3B0JywgJ2luJywgJ2Z0JywgJ3B4JyBdO1xuXG52YXIgY29udmVyc2lvbnMgPSB7XG4gIC8vIG1ldHJpY1xuICBtOiB7XG4gICAgc3lzdGVtOiAnbWV0cmljJyxcbiAgICBmYWN0b3I6IDFcbiAgfSxcbiAgY206IHtcbiAgICBzeXN0ZW06ICdtZXRyaWMnLFxuICAgIGZhY3RvcjogMSAvIDEwMFxuICB9LFxuICBtbToge1xuICAgIHN5c3RlbTogJ21ldHJpYycsXG4gICAgZmFjdG9yOiAxIC8gMTAwMFxuICB9LFxuICAvLyBpbXBlcmlhbFxuICBwdDoge1xuICAgIHN5c3RlbTogJ2ltcGVyaWFsJyxcbiAgICBmYWN0b3I6IDEgLyA3MlxuICB9LFxuICBwYzoge1xuICAgIHN5c3RlbTogJ2ltcGVyaWFsJyxcbiAgICBmYWN0b3I6IDEgLyA2XG4gIH0sXG4gIGluOiB7XG4gICAgc3lzdGVtOiAnaW1wZXJpYWwnLFxuICAgIGZhY3RvcjogMVxuICB9LFxuICBmdDoge1xuICAgIHN5c3RlbTogJ2ltcGVyaWFsJyxcbiAgICBmYWN0b3I6IDEyXG4gIH1cbn07XG5cbmNvbnN0IGFuY2hvcnMgPSB7XG4gIG1ldHJpYzoge1xuICAgIHVuaXQ6ICdtJyxcbiAgICByYXRpbzogMSAvIDAuMDI1NFxuICB9LFxuICBpbXBlcmlhbDoge1xuICAgIHVuaXQ6ICdpbicsXG4gICAgcmF0aW86IDAuMDI1NFxuICB9XG59O1xuXG5mdW5jdGlvbiByb3VuZCAodmFsdWUsIGRlY2ltYWxzKSB7XG4gIHJldHVybiBOdW1iZXIoTWF0aC5yb3VuZCh2YWx1ZSArICdlJyArIGRlY2ltYWxzKSArICdlLScgKyBkZWNpbWFscyk7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnREaXN0YW5jZSAodmFsdWUsIGZyb21Vbml0LCB0b1VuaXQsIG9wdHMpIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgIWlzRmluaXRlKHZhbHVlKSkgdGhyb3cgbmV3IEVycm9yKCdWYWx1ZSBtdXN0IGJlIGEgZmluaXRlIG51bWJlcicpO1xuICBpZiAoIWZyb21Vbml0IHx8ICF0b1VuaXQpIHRocm93IG5ldyBFcnJvcignTXVzdCBzcGVjaWZ5IGZyb20gYW5kIHRvIHVuaXRzJyk7XG5cbiAgb3B0cyA9IG9wdHMgfHwge307XG4gIHZhciBwaXhlbHNQZXJJbmNoID0gZGVmaW5lZChvcHRzLnBpeGVsc1BlckluY2gsIDk2KTtcbiAgdmFyIHByZWNpc2lvbiA9IG9wdHMucHJlY2lzaW9uO1xuICB2YXIgcm91bmRQaXhlbCA9IG9wdHMucm91bmRQaXhlbCAhPT0gZmFsc2U7XG5cbiAgZnJvbVVuaXQgPSBmcm9tVW5pdC50b0xvd2VyQ2FzZSgpO1xuICB0b1VuaXQgPSB0b1VuaXQudG9Mb3dlckNhc2UoKTtcblxuICBpZiAodW5pdHMuaW5kZXhPZihmcm9tVW5pdCkgPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZnJvbSB1bml0IFwiJyArIGZyb21Vbml0ICsgJ1wiLCBtdXN0IGJlIG9uZSBvZjogJyArIHVuaXRzLmpvaW4oJywgJykpO1xuICBpZiAodW5pdHMuaW5kZXhPZih0b1VuaXQpID09PSAtMSkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGZyb20gdW5pdCBcIicgKyB0b1VuaXQgKyAnXCIsIG11c3QgYmUgb25lIG9mOiAnICsgdW5pdHMuam9pbignLCAnKSk7XG5cbiAgaWYgKGZyb21Vbml0ID09PSB0b1VuaXQpIHtcbiAgICAvLyBXZSBkb24ndCBuZWVkIHRvIGNvbnZlcnQgZnJvbSBBIHRvIEIgc2luY2UgdGhleSBhcmUgdGhlIHNhbWUgYWxyZWFkeVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHZhciB0b0ZhY3RvciA9IDE7XG4gIHZhciBmcm9tRmFjdG9yID0gMTtcbiAgdmFyIGlzVG9QaXhlbCA9IGZhbHNlO1xuXG4gIGlmIChmcm9tVW5pdCA9PT0gJ3B4Jykge1xuICAgIGZyb21GYWN0b3IgPSAxIC8gcGl4ZWxzUGVySW5jaDtcbiAgICBmcm9tVW5pdCA9ICdpbic7XG4gIH1cbiAgaWYgKHRvVW5pdCA9PT0gJ3B4Jykge1xuICAgIGlzVG9QaXhlbCA9IHRydWU7XG4gICAgdG9GYWN0b3IgPSBwaXhlbHNQZXJJbmNoO1xuICAgIHRvVW5pdCA9ICdpbic7XG4gIH1cblxuICB2YXIgZnJvbVVuaXREYXRhID0gY29udmVyc2lvbnNbZnJvbVVuaXRdO1xuICB2YXIgdG9Vbml0RGF0YSA9IGNvbnZlcnNpb25zW3RvVW5pdF07XG5cbiAgLy8gc291cmNlIHRvIGFuY2hvciBpbnNpZGUgc291cmNlJ3Mgc3lzdGVtXG4gIHZhciBhbmNob3IgPSB2YWx1ZSAqIGZyb21Vbml0RGF0YS5mYWN0b3IgKiBmcm9tRmFjdG9yO1xuXG4gIC8vIGlmIHN5c3RlbXMgZGlmZmVyLCBjb252ZXJ0IG9uZSB0byBhbm90aGVyXG4gIGlmIChmcm9tVW5pdERhdGEuc3lzdGVtICE9PSB0b1VuaXREYXRhLnN5c3RlbSkge1xuICAgIC8vIHJlZ3VsYXIgJ20nIHRvICdpbicgYW5kIHNvIGZvcnRoXG4gICAgYW5jaG9yICo9IGFuY2hvcnNbZnJvbVVuaXREYXRhLnN5c3RlbV0ucmF0aW87XG4gIH1cblxuICB2YXIgcmVzdWx0ID0gYW5jaG9yIC8gdG9Vbml0RGF0YS5mYWN0b3IgKiB0b0ZhY3RvcjtcbiAgaWYgKGlzVG9QaXhlbCAmJiByb3VuZFBpeGVsKSB7XG4gICAgcmVzdWx0ID0gTWF0aC5yb3VuZChyZXN1bHQpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBwcmVjaXNpb24gPT09ICdudW1iZXInICYmIGlzRmluaXRlKHByZWNpc2lvbikpIHtcbiAgICByZXN1bHQgPSByb3VuZChyZXN1bHQsIHByZWNpc2lvbik7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjb252ZXJ0RGlzdGFuY2U7XG5tb2R1bGUuZXhwb3J0cy51bml0cyA9IHVuaXRzO1xuIiwiaW1wb3J0IHBhcGVyU2l6ZXMgZnJvbSAnLi9wYXBlci1zaXplcyc7XG5pbXBvcnQgY29udmVydExlbmd0aCBmcm9tICdjb252ZXJ0LWxlbmd0aCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREaW1lbnNpb25zRnJvbVByZXNldCAoZGltZW5zaW9ucywgdW5pdHNUbyA9ICdweCcsIHBpeGVsc1BlckluY2ggPSA3Mikge1xuICBpZiAodHlwZW9mIGRpbWVuc2lvbnMgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3Qga2V5ID0gZGltZW5zaW9ucy50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghKGtleSBpbiBwYXBlclNpemVzKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGUgZGltZW5zaW9uIHByZXNldCBcIiR7ZGltZW5zaW9uc31cIiBpcyBub3Qgc3VwcG9ydGVkIG9yIGNvdWxkIG5vdCBiZSBmb3VuZDsgdHJ5IHVzaW5nIGE0LCBhMywgcG9zdGNhcmQsIGxldHRlciwgZXRjLmApXG4gICAgfVxuICAgIGNvbnN0IHByZXNldCA9IHBhcGVyU2l6ZXNba2V5XTtcbiAgICByZXR1cm4gcHJlc2V0LmRpbWVuc2lvbnMubWFwKGQgPT4ge1xuICAgICAgcmV0dXJuIGNvbnZlcnREaXN0YW5jZShkLCBwcmVzZXQudW5pdHMsIHVuaXRzVG8sIHBpeGVsc1BlckluY2gpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBkaW1lbnNpb25zO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0RGlzdGFuY2UgKGRpbWVuc2lvbiwgdW5pdHNGcm9tID0gJ3B4JywgdW5pdHNUbyA9ICdweCcsIHBpeGVsc1BlckluY2ggPSA3Mikge1xuICByZXR1cm4gY29udmVydExlbmd0aChkaW1lbnNpb24sIHVuaXRzRnJvbSwgdW5pdHNUbywge1xuICAgIHBpeGVsc1BlckluY2gsXG4gICAgcHJlY2lzaW9uOiA0LFxuICAgIHJvdW5kUGl4ZWw6IHRydWVcbiAgfSk7XG59XG4iLCJpbXBvcnQgeyBnZXREaW1lbnNpb25zRnJvbVByZXNldCwgY29udmVydERpc3RhbmNlIH0gZnJvbSAnLi4vZGlzdGFuY2VzJztcbmltcG9ydCB7IGlzQnJvd3NlciwgZGVmaW5lZCB9IGZyb20gJy4uL3V0aWwnO1xuXG5mdW5jdGlvbiBjaGVja0lmSGFzRGltZW5zaW9ucyAoc2V0dGluZ3MpIHtcbiAgaWYgKCFzZXR0aW5ncy5kaW1lbnNpb25zKSByZXR1cm4gZmFsc2U7XG4gIGlmICh0eXBlb2Ygc2V0dGluZ3MuZGltZW5zaW9ucyA9PT0gJ3N0cmluZycpIHJldHVybiB0cnVlO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZXR0aW5ncy5kaW1lbnNpb25zKSAmJiBzZXR0aW5ncy5kaW1lbnNpb25zLmxlbmd0aCA+PSAyKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBnZXRQYXJlbnRTaXplIChwcm9wcywgc2V0dGluZ3MpIHtcbiAgLy8gV2hlbiBubyB7IGRpbWVuc2lvbiB9IGlzIHBhc3NlZCBpbiBub2RlLCB3ZSBkZWZhdWx0IHRvIEhUTUwgY2FudmFzIHNpemVcbiAgaWYgKCFpc0Jyb3dzZXIoKSkge1xuICAgIHJldHVybiBbIDMwMCwgMTUwIF07XG4gIH1cblxuICBsZXQgZWxlbWVudCA9IHNldHRpbmdzLnBhcmVudCB8fCB3aW5kb3c7XG5cbiAgaWYgKGVsZW1lbnQgPT09IHdpbmRvdyB8fFxuICAgICAgZWxlbWVudCA9PT0gZG9jdW1lbnQgfHxcbiAgICAgIGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICByZXR1cm4gWyB3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0IF07XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgeyB3aWR0aCwgaGVpZ2h0IH0gPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHJldHVybiBbIHdpZHRoLCBoZWlnaHQgXTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiByZXNpemVDYW52YXMgKHByb3BzLCBzZXR0aW5ncykge1xuICBsZXQgd2lkdGgsIGhlaWdodDtcbiAgbGV0IHN0eWxlV2lkdGgsIHN0eWxlSGVpZ2h0O1xuICBsZXQgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodDtcblxuICBjb25zdCBicm93c2VyID0gaXNCcm93c2VyKCk7XG4gIGNvbnN0IGRpbWVuc2lvbnMgPSBzZXR0aW5ncy5kaW1lbnNpb25zO1xuICBjb25zdCBoYXNEaW1lbnNpb25zID0gY2hlY2tJZkhhc0RpbWVuc2lvbnMoc2V0dGluZ3MpO1xuICBjb25zdCBleHBvcnRpbmcgPSBwcm9wcy5leHBvcnRpbmc7XG4gIGxldCBzY2FsZVRvRml0ID0gaGFzRGltZW5zaW9ucyA/IHNldHRpbmdzLnNjYWxlVG9GaXQgIT09IGZhbHNlIDogZmFsc2U7XG4gIGxldCBzY2FsZVRvVmlldyA9ICghZXhwb3J0aW5nICYmIGhhc0RpbWVuc2lvbnMpID8gc2V0dGluZ3Muc2NhbGVUb1ZpZXcgOiB0cnVlO1xuICAvLyBpbiBub2RlLCBjYW5jZWwgYm90aCBvZiB0aGVzZSBvcHRpb25zXG4gIGlmICghYnJvd3Nlcikgc2NhbGVUb0ZpdCA9IHNjYWxlVG9WaWV3ID0gZmFsc2U7XG4gIGNvbnN0IHVuaXRzID0gc2V0dGluZ3MudW5pdHM7XG4gIGNvbnN0IHBpeGVsc1BlckluY2ggPSAodHlwZW9mIHNldHRpbmdzLnBpeGVsc1BlckluY2ggPT09ICdudW1iZXInICYmIGlzRmluaXRlKHNldHRpbmdzLnBpeGVsc1BlckluY2gpKSA/IHNldHRpbmdzLnBpeGVsc1BlckluY2ggOiA3MjtcbiAgY29uc3QgYmxlZWQgPSBkZWZpbmVkKHNldHRpbmdzLmJsZWVkLCAwKTtcblxuICBjb25zdCBkZXZpY2VQaXhlbFJhdGlvID0gYnJvd3NlciA/IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvIDogMTtcbiAgY29uc3QgYmFzZVBpeGVsUmF0aW8gPSBzY2FsZVRvVmlldyA/IGRldmljZVBpeGVsUmF0aW8gOiAxO1xuXG4gIGxldCBwaXhlbFJhdGlvLCBleHBvcnRQaXhlbFJhdGlvO1xuXG4gIC8vIElmIGEgcGl4ZWwgcmF0aW8gaXMgc3BlY2lmaWVkLCB3ZSB3aWxsIHVzZSBpdC5cbiAgLy8gT3RoZXJ3aXNlOlxuICAvLyAgLT4gSWYgZGltZW5zaW9uIGlzIHNwZWNpZmllZCwgdXNlIGJhc2UgcmF0aW8gKGkuZS4gc2l6ZSBmb3IgZXhwb3J0KVxuICAvLyAgLT4gSWYgbm8gZGltZW5zaW9uIGlzIHNwZWNpZmllZCwgdXNlIGRldmljZSByYXRpbyAoaS5lLiBzaXplIGZvciBzY3JlZW4pXG4gIGlmICh0eXBlb2Ygc2V0dGluZ3MucGl4ZWxSYXRpbyA9PT0gJ251bWJlcicgJiYgaXNGaW5pdGUoc2V0dGluZ3MucGl4ZWxSYXRpbykpIHtcbiAgICAvLyBXaGVuIHsgcGl4ZWxSYXRpbyB9IGlzIHNwZWNpZmllZCwgaXQncyBhbHNvIHVzZWQgYXMgZGVmYXVsdCBleHBvcnRQaXhlbFJhdGlvLlxuICAgIHBpeGVsUmF0aW8gPSBzZXR0aW5ncy5waXhlbFJhdGlvO1xuICAgIGV4cG9ydFBpeGVsUmF0aW8gPSBkZWZpbmVkKHNldHRpbmdzLmV4cG9ydFBpeGVsUmF0aW8sIHBpeGVsUmF0aW8pO1xuICB9IGVsc2Uge1xuICAgIGlmIChoYXNEaW1lbnNpb25zKSB7XG4gICAgICAvLyBXaGVuIGEgZGltZW5zaW9uIGlzIHNwZWNpZmllZCwgdXNlIHRoZSBiYXNlIHJhdGlvIHJhdGhlciB0aGFuIHNjcmVlbiByYXRpb1xuICAgICAgcGl4ZWxSYXRpbyA9IGJhc2VQaXhlbFJhdGlvO1xuICAgICAgLy8gRGVmYXVsdCB0byBhIHBpeGVsIHJhdGlvIG9mIDEgc28gdGhhdCB5b3UgZW5kIHVwIHdpdGggdGhlIHNhbWUgZGltZW5zaW9uXG4gICAgICAvLyB5b3Ugc3BlY2lmaWVkLCBpLmUuIFsgNTAwLCA1MDAgXSBpcyBleHBvcnRlZCBhcyA1MDB4NTAwIHB4XG4gICAgICBleHBvcnRQaXhlbFJhdGlvID0gZGVmaW5lZChzZXR0aW5ncy5leHBvcnRQaXhlbFJhdGlvLCAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTm8gZGltZW5zaW9uIGlzIHNwZWNpZmllZCwgYXNzdW1lIGZ1bGwtc2NyZWVuIHJldGluYSBzaXppbmdcbiAgICAgIHBpeGVsUmF0aW8gPSBkZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgLy8gRGVmYXVsdCB0byBzY3JlZW4gcGl4ZWwgcmF0aW8sIHNvIHRoYXQgaXQncyBsaWtlIHRha2luZyBhIGRldmljZSBzY3JlZW5zaG90XG4gICAgICBleHBvcnRQaXhlbFJhdGlvID0gZGVmaW5lZChzZXR0aW5ncy5leHBvcnRQaXhlbFJhdGlvLCBwaXhlbFJhdGlvKTtcbiAgICB9XG4gIH1cblxuICAvLyBDbGFtcCBwaXhlbCByYXRpb1xuICBpZiAodHlwZW9mIHNldHRpbmdzLm1heFBpeGVsUmF0aW8gPT09ICdudW1iZXInICYmIGlzRmluaXRlKHNldHRpbmdzLm1heFBpeGVsUmF0aW8pKSB7XG4gICAgcGl4ZWxSYXRpbyA9IE1hdGgubWluKHNldHRpbmdzLm1heFBpeGVsUmF0aW8sIHBpeGVsUmF0aW8pO1xuICB9XG5cbiAgLy8gSGFuZGxlIGV4cG9ydCBwaXhlbCByYXRpb1xuICBpZiAoZXhwb3J0aW5nKSB7XG4gICAgcGl4ZWxSYXRpbyA9IGV4cG9ydFBpeGVsUmF0aW87XG4gIH1cblxuICAvLyBwYXJlbnRXaWR0aCA9IHR5cGVvZiBwYXJlbnRXaWR0aCA9PT0gJ3VuZGVmaW5lZCcgPyBkZWZhdWx0Tm9kZVNpemVbMF0gOiBwYXJlbnRXaWR0aDtcbiAgLy8gcGFyZW50SGVpZ2h0ID0gdHlwZW9mIHBhcmVudEhlaWdodCA9PT0gJ3VuZGVmaW5lZCcgPyBkZWZhdWx0Tm9kZVNpemVbMV0gOiBwYXJlbnRIZWlnaHQ7XG5cbiAgbGV0IFsgcGFyZW50V2lkdGgsIHBhcmVudEhlaWdodCBdID0gZ2V0UGFyZW50U2l6ZShwcm9wcywgc2V0dGluZ3MpO1xuICBsZXQgdHJpbVdpZHRoLCB0cmltSGVpZ2h0O1xuXG4gIC8vIFlvdSBjYW4gc3BlY2lmeSBhIGRpbWVuc2lvbnMgaW4gcGl4ZWxzIG9yIGNtL20vaW4vZXRjXG4gIGlmIChoYXNEaW1lbnNpb25zKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gZ2V0RGltZW5zaW9uc0Zyb21QcmVzZXQoZGltZW5zaW9ucywgdW5pdHMsIHBpeGVsc1BlckluY2gpO1xuICAgIGNvbnN0IGhpZ2hlc3QgPSBNYXRoLm1heChyZXN1bHRbMF0sIHJlc3VsdFsxXSk7XG4gICAgY29uc3QgbG93ZXN0ID0gTWF0aC5taW4ocmVzdWx0WzBdLCByZXN1bHRbMV0pO1xuICAgIGlmIChzZXR0aW5ncy5vcmllbnRhdGlvbikge1xuICAgICAgY29uc3QgbGFuZHNjYXBlID0gc2V0dGluZ3Mub3JpZW50YXRpb24gPT09ICdsYW5kc2NhcGUnO1xuICAgICAgd2lkdGggPSBsYW5kc2NhcGUgPyBoaWdoZXN0IDogbG93ZXN0O1xuICAgICAgaGVpZ2h0ID0gbGFuZHNjYXBlID8gbG93ZXN0IDogaGlnaGVzdDtcbiAgICB9IGVsc2Uge1xuICAgICAgd2lkdGggPSByZXN1bHRbMF07XG4gICAgICBoZWlnaHQgPSByZXN1bHRbMV07XG4gICAgfVxuXG4gICAgdHJpbVdpZHRoID0gd2lkdGg7XG4gICAgdHJpbUhlaWdodCA9IGhlaWdodDtcblxuICAgIC8vIEFwcGx5IGJsZWVkIHdoaWNoIGlzIGFzc3VtZWQgdG8gYmUgaW4gdGhlIHNhbWUgdW5pdHNcbiAgICB3aWR0aCArPSBibGVlZCAqIDI7XG4gICAgaGVpZ2h0ICs9IGJsZWVkICogMjtcbiAgfSBlbHNlIHtcbiAgICB3aWR0aCA9IHBhcmVudFdpZHRoO1xuICAgIGhlaWdodCA9IHBhcmVudEhlaWdodDtcbiAgICB0cmltV2lkdGggPSB3aWR0aDtcbiAgICB0cmltSGVpZ2h0ID0gaGVpZ2h0O1xuICB9XG5cbiAgLy8gUmVhbCBzaXplIGluIHBpeGVscyBhZnRlciBQUEkgaXMgdGFrZW4gaW50byBhY2NvdW50XG4gIGxldCByZWFsV2lkdGggPSB3aWR0aDtcbiAgbGV0IHJlYWxIZWlnaHQgPSBoZWlnaHQ7XG4gIGlmIChoYXNEaW1lbnNpb25zICYmIHVuaXRzKSB7XG4gICAgLy8gQ29udmVydCB0byBkaWdpdGFsL3BpeGVsIHVuaXRzIGlmIG5lY2Vzc2FyeVxuICAgIHJlYWxXaWR0aCA9IGNvbnZlcnREaXN0YW5jZSh3aWR0aCwgdW5pdHMsICdweCcsIHBpeGVsc1BlckluY2gpO1xuICAgIHJlYWxIZWlnaHQgPSBjb252ZXJ0RGlzdGFuY2UoaGVpZ2h0LCB1bml0cywgJ3B4JywgcGl4ZWxzUGVySW5jaCk7XG4gIH1cblxuICAvLyBIb3cgYmlnIHRvIHNldCB0aGUgJ3ZpZXcnIG9mIHRoZSBjYW52YXMgaW4gdGhlIGJyb3dzZXIgKGkuZS4gc3R5bGUpXG4gIHN0eWxlV2lkdGggPSBNYXRoLnJvdW5kKHJlYWxXaWR0aCk7XG4gIHN0eWxlSGVpZ2h0ID0gTWF0aC5yb3VuZChyZWFsSGVpZ2h0KTtcblxuICAvLyBJZiB3ZSB3aXNoIHRvIHNjYWxlIHRoZSB2aWV3IHRvIHRoZSBicm93c2VyIHdpbmRvd1xuICBpZiAoc2NhbGVUb0ZpdCAmJiAhZXhwb3J0aW5nICYmIGhhc0RpbWVuc2lvbnMpIHtcbiAgICBjb25zdCBhc3BlY3QgPSB3aWR0aCAvIGhlaWdodDtcbiAgICBjb25zdCB3aW5kb3dBc3BlY3QgPSBwYXJlbnRXaWR0aCAvIHBhcmVudEhlaWdodDtcbiAgICBjb25zdCBzY2FsZVRvRml0UGFkZGluZyA9IGRlZmluZWQoc2V0dGluZ3Muc2NhbGVUb0ZpdFBhZGRpbmcsIDQwKTtcbiAgICBjb25zdCBtYXhXaWR0aCA9IE1hdGgucm91bmQocGFyZW50V2lkdGggLSBzY2FsZVRvRml0UGFkZGluZyAqIDIpO1xuICAgIGNvbnN0IG1heEhlaWdodCA9IE1hdGgucm91bmQocGFyZW50SGVpZ2h0IC0gc2NhbGVUb0ZpdFBhZGRpbmcgKiAyKTtcbiAgICBpZiAoc3R5bGVXaWR0aCA+IG1heFdpZHRoIHx8IHN0eWxlSGVpZ2h0ID4gbWF4SGVpZ2h0KSB7XG4gICAgICBpZiAod2luZG93QXNwZWN0ID4gYXNwZWN0KSB7XG4gICAgICAgIHN0eWxlSGVpZ2h0ID0gbWF4SGVpZ2h0O1xuICAgICAgICBzdHlsZVdpZHRoID0gTWF0aC5yb3VuZChzdHlsZUhlaWdodCAqIGFzcGVjdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHlsZVdpZHRoID0gbWF4V2lkdGg7XG4gICAgICAgIHN0eWxlSGVpZ2h0ID0gTWF0aC5yb3VuZChzdHlsZVdpZHRoIC8gYXNwZWN0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjYW52YXNXaWR0aCA9IHNjYWxlVG9WaWV3ID8gTWF0aC5yb3VuZChwaXhlbFJhdGlvICogc3R5bGVXaWR0aCkgOiBNYXRoLnJvdW5kKHBpeGVsUmF0aW8gKiByZWFsV2lkdGgpO1xuICBjYW52YXNIZWlnaHQgPSBzY2FsZVRvVmlldyA/IE1hdGgucm91bmQocGl4ZWxSYXRpbyAqIHN0eWxlSGVpZ2h0KSA6IE1hdGgucm91bmQocGl4ZWxSYXRpbyAqIHJlYWxIZWlnaHQpO1xuXG4gIGNvbnN0IHZpZXdwb3J0V2lkdGggPSBzY2FsZVRvVmlldyA/IE1hdGgucm91bmQoc3R5bGVXaWR0aCkgOiBNYXRoLnJvdW5kKHJlYWxXaWR0aCk7XG4gIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gc2NhbGVUb1ZpZXcgPyBNYXRoLnJvdW5kKHN0eWxlSGVpZ2h0KSA6IE1hdGgucm91bmQocmVhbEhlaWdodCk7XG5cbiAgY29uc3Qgc2NhbGVYID0gY2FudmFzV2lkdGggLyB3aWR0aDtcbiAgY29uc3Qgc2NhbGVZID0gY2FudmFzSGVpZ2h0IC8gaGVpZ2h0O1xuXG4gIC8vIEFzc2lnbiB0byBjdXJyZW50IHByb3BzXG4gIHJldHVybiB7XG4gICAgYmxlZWQsXG4gICAgcGl4ZWxSYXRpbyxcbiAgICB3aWR0aCxcbiAgICBoZWlnaHQsXG4gICAgZGltZW5zaW9uczogWyB3aWR0aCwgaGVpZ2h0IF0sXG4gICAgdW5pdHM6IHVuaXRzIHx8ICdweCcsXG4gICAgc2NhbGVYLFxuICAgIHNjYWxlWSxcbiAgICBwaXhlbHNQZXJJbmNoLFxuICAgIHZpZXdwb3J0V2lkdGgsXG4gICAgdmlld3BvcnRIZWlnaHQsXG4gICAgY2FudmFzV2lkdGgsXG4gICAgY2FudmFzSGVpZ2h0LFxuICAgIHRyaW1XaWR0aCxcbiAgICB0cmltSGVpZ2h0LFxuICAgIHN0eWxlV2lkdGgsXG4gICAgc3R5bGVIZWlnaHRcbiAgfTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZ2V0Q2FudmFzQ29udGV4dFxuZnVuY3Rpb24gZ2V0Q2FudmFzQ29udGV4dCAodHlwZSwgb3B0cykge1xuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzcGVjaWZ5IHR5cGUgc3RyaW5nJylcbiAgfVxuXG4gIG9wdHMgPSBvcHRzIHx8IHt9XG5cbiAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgJiYgIW9wdHMuY2FudmFzKSB7XG4gICAgcmV0dXJuIG51bGwgLy8gY2hlY2sgZm9yIE5vZGVcbiAgfVxuXG4gIHZhciBjYW52YXMgPSBvcHRzLmNhbnZhcyB8fCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICBpZiAodHlwZW9mIG9wdHMud2lkdGggPT09ICdudW1iZXInKSB7XG4gICAgY2FudmFzLndpZHRoID0gb3B0cy53aWR0aFxuICB9XG4gIGlmICh0eXBlb2Ygb3B0cy5oZWlnaHQgPT09ICdudW1iZXInKSB7XG4gICAgY2FudmFzLmhlaWdodCA9IG9wdHMuaGVpZ2h0XG4gIH1cblxuICB2YXIgYXR0cmlicyA9IG9wdHNcbiAgdmFyIGdsXG4gIHRyeSB7XG4gICAgdmFyIG5hbWVzID0gWyB0eXBlIF1cbiAgICAvLyBwcmVmaXggR0wgY29udGV4dHNcbiAgICBpZiAodHlwZS5pbmRleE9mKCd3ZWJnbCcpID09PSAwKSB7XG4gICAgICBuYW1lcy5wdXNoKCdleHBlcmltZW50YWwtJyArIHR5cGUpXG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgZ2wgPSBjYW52YXMuZ2V0Q29udGV4dChuYW1lc1tpXSwgYXR0cmlicylcbiAgICAgIGlmIChnbCkgcmV0dXJuIGdsXG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgZ2wgPSBudWxsXG4gIH1cbiAgcmV0dXJuIChnbCB8fCBudWxsKSAvLyBlbnN1cmUgbnVsbCBvbiBmYWlsXG59XG4iLCJpbXBvcnQgYXNzaWduIGZyb20gJ29iamVjdC1hc3NpZ24nO1xuaW1wb3J0IGdldENhbnZhc0NvbnRleHQgZnJvbSAnZ2V0LWNhbnZhcy1jb250ZXh0JztcbmltcG9ydCB7IGlzQnJvd3NlciB9IGZyb20gJy4uL3V0aWwnO1xuXG5mdW5jdGlvbiBjcmVhdGVDYW52YXNFbGVtZW50ICgpIHtcbiAgaWYgKCFpc0Jyb3dzZXIoKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignSXQgYXBwZWFycyB5b3UgYXJlIHJ1bmluZyBmcm9tIE5vZGUuanMgb3IgYSBub24tYnJvd3NlciBlbnZpcm9ubWVudC4gVHJ5IHBhc3NpbmcgaW4gYW4gZXhpc3RpbmcgeyBjYW52YXMgfSBpbnRlcmZhY2UgaW5zdGVhZC4nKTtcbiAgfVxuICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoc2V0dGluZ3MgPSB7fSkge1xuICBsZXQgY29udGV4dCwgY2FudmFzO1xuICBsZXQgb3duc0NhbnZhcyA9IGZhbHNlO1xuICBpZiAoc2V0dGluZ3MuY2FudmFzICE9PSBmYWxzZSkge1xuICAgIC8vIERldGVybWluZSB0aGUgY2FudmFzIGFuZCBjb250ZXh0IHRvIGNyZWF0ZVxuICAgIGNvbnRleHQgPSBzZXR0aW5ncy5jb250ZXh0O1xuICAgIGlmICghY29udGV4dCB8fCB0eXBlb2YgY29udGV4dCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGxldCBuZXdDYW52YXMgPSBzZXR0aW5ncy5jYW52YXM7XG4gICAgICBpZiAoIW5ld0NhbnZhcykge1xuICAgICAgICBuZXdDYW52YXMgPSBjcmVhdGVDYW52YXNFbGVtZW50KCk7XG4gICAgICAgIG93bnNDYW52YXMgPSB0cnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgdHlwZSA9IGNvbnRleHQgfHwgJzJkJztcbiAgICAgIGlmICh0eXBlb2YgbmV3Q2FudmFzLmdldENvbnRleHQgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGUgc3BlY2lmaWVkIHsgY2FudmFzIH0gZWxlbWVudCBkb2VzIG5vdCBoYXZlIGEgZ2V0Q29udGV4dCgpIGZ1bmN0aW9uLCBtYXliZSBpdCBpcyBub3QgYSA8Y2FudmFzPiB0YWc/YCk7XG4gICAgICB9XG4gICAgICBjb250ZXh0ID0gZ2V0Q2FudmFzQ29udGV4dCh0eXBlLCBhc3NpZ24oe30sIHNldHRpbmdzLmF0dHJpYnV0ZXMsIHsgY2FudmFzOiBuZXdDYW52YXMgfSkpO1xuICAgICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIGF0IGNhbnZhcy5nZXRDb250ZXh0KCcke3R5cGV9JykgLSB0aGUgYnJvd3NlciBtYXkgbm90IHN1cHBvcnQgdGhpcyBjb250ZXh0LCBvciBhIGRpZmZlcmVudCBjb250ZXh0IG1heSBhbHJlYWR5IGJlIGluIHVzZSB3aXRoIHRoaXMgY2FudmFzLmApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNhbnZhcyA9IGNvbnRleHQuY2FudmFzO1xuICAgIC8vIEVuc3VyZSBjb250ZXh0IG1hdGNoZXMgdXNlcidzIGNhbnZhcyBleHBlY3RhdGlvbnNcbiAgICBpZiAoc2V0dGluZ3MuY2FudmFzICYmIGNhbnZhcyAhPT0gc2V0dGluZ3MuY2FudmFzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSB7IGNhbnZhcyB9IGFuZCB7IGNvbnRleHQgfSBzZXR0aW5ncyBtdXN0IHBvaW50IHRvIHRoZSBzYW1lIHVuZGVybHlpbmcgY2FudmFzIGVsZW1lbnQnKTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSBwaXhlbGF0aW9uIHRvIGNhbnZhcyBpZiBuZWNlc3NhcnksIHRoaXMgaXMgbW9zdGx5IGEgY29udmVuaWVuY2UgdXRpbGl0eVxuICAgIGlmIChzZXR0aW5ncy5waXhlbGF0ZWQpIHtcbiAgICAgIGNvbnRleHQuaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7XG4gICAgICBjb250ZXh0Lm1vekltYWdlU21vb3RoaW5nRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgY29udGV4dC5vSW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7XG4gICAgICBjb250ZXh0LndlYmtpdEltYWdlU21vb3RoaW5nRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgY29udGV4dC5tc0ltYWdlU21vb3RoaW5nRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgY2FudmFzLnN0eWxlWydpbWFnZS1yZW5kZXJpbmcnXSA9ICdwaXhlbGF0ZWQnO1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBjYW52YXMsIGNvbnRleHQsIG93bnNDYW52YXMgfTtcbn1cbiIsImltcG9ydCBhc3NpZ24gZnJvbSAnb2JqZWN0LWFzc2lnbic7XG5pbXBvcnQgcmlnaHROb3cgZnJvbSAncmlnaHQtbm93JztcbmltcG9ydCBpc1Byb21pc2UgZnJvbSAnaXMtcHJvbWlzZSc7XG5pbXBvcnQgeyBpc0Jyb3dzZXIsIGRlZmluZWQsIGlzV2ViR0xDb250ZXh0LCBpc0NhbnZhcywgZ2V0Q2xpZW50QVBJIH0gZnJvbSAnLi4vdXRpbCc7XG5pbXBvcnQgZGVlcEVxdWFsIGZyb20gJ2RlZXAtZXF1YWwnO1xuaW1wb3J0IHtcbiAgcmVzb2x2ZUZpbGVuYW1lLFxuICBzYXZlRmlsZSxcbiAgc2F2ZURhdGFVUkwsXG4gIGdldFRpbWVTdGFtcCxcbiAgZXhwb3J0Q2FudmFzLFxuICBzdHJlYW1TdGFydCxcbiAgc3RyZWFtRW5kXG59IGZyb20gJy4uL3NhdmUnO1xuaW1wb3J0IHsgY2hlY2tTZXR0aW5ncyB9IGZyb20gJy4uL2FjY2Vzc2liaWxpdHknO1xuXG5pbXBvcnQga2V5Ym9hcmRTaG9ydGN1dHMgZnJvbSAnLi9rZXlib2FyZFNob3J0Y3V0cyc7XG5pbXBvcnQgcmVzaXplQ2FudmFzIGZyb20gJy4vcmVzaXplQ2FudmFzJztcbmltcG9ydCBjcmVhdGVDYW52YXMgZnJvbSAnLi9jcmVhdGVDYW52YXMnO1xuXG5jbGFzcyBTa2V0Y2hNYW5hZ2VyIHtcbiAgY29uc3RydWN0b3IgKCkge1xuICAgIHRoaXMuX3NldHRpbmdzID0ge307XG4gICAgdGhpcy5fcHJvcHMgPSB7fTtcbiAgICB0aGlzLl9za2V0Y2ggPSB1bmRlZmluZWQ7XG4gICAgdGhpcy5fcmFmID0gbnVsbDtcbiAgICB0aGlzLl9yZWNvcmRUaW1lb3V0ID0gbnVsbDtcblxuICAgIC8vIFNvbWUgaGFja3kgdGhpbmdzIHJlcXVpcmVkIHRvIGdldCBhcm91bmQgcDUuanMgc3RydWN0dXJlXG4gICAgdGhpcy5fbGFzdFJlZHJhd1Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLl9pc1A1UmVzaXppbmcgPSBmYWxzZTtcblxuICAgIHRoaXMuX2tleWJvYXJkU2hvcnRjdXRzID0ga2V5Ym9hcmRTaG9ydGN1dHMoe1xuICAgICAgZW5hYmxlZDogKCkgPT4gdGhpcy5zZXR0aW5ncy5ob3RrZXlzICE9PSBmYWxzZSxcbiAgICAgIHNhdmU6IChldikgPT4ge1xuICAgICAgICBpZiAoZXYuc2hpZnRLZXkpIHtcbiAgICAgICAgICBpZiAodGhpcy5wcm9wcy5yZWNvcmRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuZW5kUmVjb3JkKCk7XG4gICAgICAgICAgICB0aGlzLnJ1bigpO1xuICAgICAgICAgIH0gZWxzZSB0aGlzLnJlY29yZCgpO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLnByb3BzLnJlY29yZGluZykge1xuICAgICAgICAgIHRoaXMuZXhwb3J0RnJhbWUoKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHRvZ2dsZVBsYXk6ICgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMucHJvcHMucGxheWluZykgdGhpcy5wYXVzZSgpO1xuICAgICAgICBlbHNlIHRoaXMucGxheSgpO1xuICAgICAgfSxcbiAgICAgIGNvbW1pdDogKGV2KSA9PiB7XG4gICAgICAgIHRoaXMuZXhwb3J0RnJhbWUoeyBjb21taXQ6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLl9hbmltYXRlSGFuZGxlciA9ICgpID0+IHRoaXMuYW5pbWF0ZSgpO1xuXG4gICAgdGhpcy5fcmVzaXplSGFuZGxlciA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGNoYW5nZWQgPSB0aGlzLnJlc2l6ZSgpO1xuICAgICAgLy8gT25seSByZS1yZW5kZXIgd2hlbiBzaXplIGFjdHVhbGx5IGNoYW5nZXNcbiAgICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGdldCBza2V0Y2ggKCkge1xuICAgIHJldHVybiB0aGlzLl9za2V0Y2g7XG4gIH1cblxuICBnZXQgc2V0dGluZ3MgKCkge1xuICAgIHJldHVybiB0aGlzLl9zZXR0aW5ncztcbiAgfVxuXG4gIGdldCBwcm9wcyAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3Byb3BzO1xuICB9XG5cbiAgX2NvbXB1dGVQbGF5aGVhZCAoY3VycmVudFRpbWUsIGR1cmF0aW9uKSB7XG4gICAgY29uc3QgaGFzRHVyYXRpb24gPSB0eXBlb2YgZHVyYXRpb24gPT09ICdudW1iZXInICYmIGlzRmluaXRlKGR1cmF0aW9uKTtcbiAgICByZXR1cm4gaGFzRHVyYXRpb24gPyBjdXJyZW50VGltZSAvIGR1cmF0aW9uIDogMDtcbiAgfVxuXG4gIF9jb21wdXRlRnJhbWUgKHBsYXloZWFkLCB0aW1lLCB0b3RhbEZyYW1lcywgZnBzKSB7XG4gICAgcmV0dXJuIChpc0Zpbml0ZSh0b3RhbEZyYW1lcykgJiYgdG90YWxGcmFtZXMgPiAxKVxuICAgICAgPyBNYXRoLmZsb29yKHBsYXloZWFkICogKHRvdGFsRnJhbWVzIC0gMSkpXG4gICAgICA6IE1hdGguZmxvb3IoZnBzICogdGltZSk7XG4gIH1cblxuICBfY29tcHV0ZUN1cnJlbnRGcmFtZSAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbXB1dGVGcmFtZShcbiAgICAgIHRoaXMucHJvcHMucGxheWhlYWQsIHRoaXMucHJvcHMudGltZSxcbiAgICAgIHRoaXMucHJvcHMudG90YWxGcmFtZXMsIHRoaXMucHJvcHMuZnBzXG4gICAgKTtcbiAgfVxuXG4gIF9nZXRTaXplUHJvcHMgKCkge1xuICAgIGNvbnN0IHByb3BzID0gdGhpcy5wcm9wcztcbiAgICByZXR1cm4ge1xuICAgICAgd2lkdGg6IHByb3BzLndpZHRoLFxuICAgICAgaGVpZ2h0OiBwcm9wcy5oZWlnaHQsXG4gICAgICBwaXhlbFJhdGlvOiBwcm9wcy5waXhlbFJhdGlvLFxuICAgICAgY2FudmFzV2lkdGg6IHByb3BzLmNhbnZhc1dpZHRoLFxuICAgICAgY2FudmFzSGVpZ2h0OiBwcm9wcy5jYW52YXNIZWlnaHQsXG4gICAgICB2aWV3cG9ydFdpZHRoOiBwcm9wcy52aWV3cG9ydFdpZHRoLFxuICAgICAgdmlld3BvcnRIZWlnaHQ6IHByb3BzLnZpZXdwb3J0SGVpZ2h0XG4gICAgfTtcbiAgfVxuXG4gIHJ1biAoKSB7XG4gICAgaWYgKCF0aGlzLnNrZXRjaCkgdGhyb3cgbmV3IEVycm9yKCdzaG91bGQgd2FpdCB1bnRpbCBza2V0Y2ggaXMgbG9hZGVkIGJlZm9yZSB0cnlpbmcgdG8gcGxheSgpJyk7XG5cbiAgICAvLyBTdGFydCBhbiBhbmltYXRpb24gZnJhbWUgbG9vcCBpZiBuZWNlc3NhcnlcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5wbGF5aW5nICE9PSBmYWxzZSkge1xuICAgICAgdGhpcy5wbGF5KCk7XG4gICAgfVxuXG4gICAgLy8gTGV0J3MgbGV0IHRoaXMgd2FybmluZyBoYW5nIGFyb3VuZCBmb3IgYSBmZXcgdmVyc2lvbnMuLi5cbiAgICBpZiAodHlwZW9mIHRoaXMuc2tldGNoLmRpc3Bvc2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnNvbGUud2FybignSW4gY2FudmFzLXNrZXRjaEAwLjAuMjMgdGhlIGRpc3Bvc2UoKSBldmVudCBoYXMgYmVlbiByZW5hbWVkIHRvIHVubG9hZCgpJyk7XG4gICAgfVxuXG4gICAgLy8gSW4gY2FzZSB3ZSBhcmVuJ3QgcGxheWluZyBvciBhbmltYXRlZCwgbWFrZSBzdXJlIHdlIHN0aWxsIHRyaWdnZXIgYmVnaW4gbWVzc2FnZS4uLlxuICAgIGlmICghdGhpcy5wcm9wcy5zdGFydGVkKSB7XG4gICAgICB0aGlzLl9zaWduYWxCZWdpbigpO1xuICAgICAgdGhpcy5wcm9wcy5zdGFydGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBSZW5kZXIgYW4gaW5pdGlhbCBmcmFtZVxuICAgIHRoaXMudGljaygpO1xuICAgIHRoaXMucmVuZGVyKCk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBfY2FuY2VsVGltZW91dHMgKCkge1xuICAgIGlmICh0aGlzLl9yYWYgIT0gbnVsbCAmJiB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2Ygd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5fcmFmKTtcbiAgICAgIHRoaXMuX3JhZiA9IG51bGw7XG4gICAgfVxuICAgIGlmICh0aGlzLl9yZWNvcmRUaW1lb3V0ICE9IG51bGwpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9yZWNvcmRUaW1lb3V0KTtcbiAgICAgIHRoaXMuX3JlY29yZFRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHBsYXkgKCkge1xuICAgIGxldCBhbmltYXRlID0gdGhpcy5zZXR0aW5ncy5hbmltYXRlO1xuICAgIGlmICgnYW5pbWF0aW9uJyBpbiB0aGlzLnNldHRpbmdzKSB7XG4gICAgICBhbmltYXRlID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUud2FybignW2NhbnZhcy1za2V0Y2hdIHsgYW5pbWF0aW9uIH0gaGFzIGJlZW4gcmVuYW1lZCB0byB7IGFuaW1hdGUgfScpO1xuICAgIH1cbiAgICBpZiAoIWFuaW1hdGUpIHJldHVybjtcbiAgICBpZiAoIWlzQnJvd3NlcigpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdbY2FudmFzLXNrZXRjaF0gV0FSTjogVXNpbmcgeyBhbmltYXRlIH0gaW4gTm9kZS5qcyBpcyBub3QgeWV0IHN1cHBvcnRlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5wcm9wcy5wbGF5aW5nKSByZXR1cm47XG4gICAgaWYgKCF0aGlzLnByb3BzLnN0YXJ0ZWQpIHtcbiAgICAgIHRoaXMuX3NpZ25hbEJlZ2luKCk7XG4gICAgICB0aGlzLnByb3BzLnN0YXJ0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKCdwbGF5JywgdGhpcy5wcm9wcy50aW1lKVxuXG4gICAgLy8gU3RhcnQgYSByZW5kZXIgbG9vcFxuICAgIHRoaXMucHJvcHMucGxheWluZyA9IHRydWU7XG4gICAgdGhpcy5fY2FuY2VsVGltZW91dHMoKTtcbiAgICB0aGlzLl9sYXN0VGltZSA9IHJpZ2h0Tm93KCk7XG4gICAgdGhpcy5fcmFmID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLl9hbmltYXRlSGFuZGxlcik7XG4gIH1cblxuICBwYXVzZSAoKSB7XG4gICAgaWYgKHRoaXMucHJvcHMucmVjb3JkaW5nKSB0aGlzLmVuZFJlY29yZCgpO1xuICAgIHRoaXMucHJvcHMucGxheWluZyA9IGZhbHNlO1xuXG4gICAgdGhpcy5fY2FuY2VsVGltZW91dHMoKTtcbiAgfVxuXG4gIHRvZ2dsZVBsYXkgKCkge1xuICAgIGlmICh0aGlzLnByb3BzLnBsYXlpbmcpIHRoaXMucGF1c2UoKTtcbiAgICBlbHNlIHRoaXMucGxheSgpO1xuICB9XG5cbiAgLy8gU3RvcCBhbmQgcmVzZXQgdG8gZnJhbWUgemVyb1xuICBzdG9wICgpIHtcbiAgICB0aGlzLnBhdXNlKCk7XG4gICAgdGhpcy5wcm9wcy5mcmFtZSA9IDA7XG4gICAgdGhpcy5wcm9wcy5wbGF5aGVhZCA9IDA7XG4gICAgdGhpcy5wcm9wcy50aW1lID0gMDtcbiAgICB0aGlzLnByb3BzLmRlbHRhVGltZSA9IDA7XG4gICAgdGhpcy5wcm9wcy5zdGFydGVkID0gZmFsc2U7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIHJlY29yZCAoKSB7XG4gICAgaWYgKHRoaXMucHJvcHMucmVjb3JkaW5nKSByZXR1cm47XG4gICAgaWYgKCFpc0Jyb3dzZXIoKSkge1xuICAgICAgY29uc29sZS5lcnJvcignW2NhbnZhcy1za2V0Y2hdIFdBUk46IFJlY29yZGluZyBmcm9tIE5vZGUuanMgaXMgbm90IHlldCBzdXBwb3J0ZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3AoKTtcbiAgICB0aGlzLnByb3BzLnBsYXlpbmcgPSB0cnVlO1xuICAgIHRoaXMucHJvcHMucmVjb3JkaW5nID0gdHJ1ZTtcblxuICAgIGNvbnN0IGV4cG9ydE9wdHMgPSB0aGlzLl9jcmVhdGVFeHBvcnRPcHRpb25zKHsgc2VxdWVuY2U6IHRydWUgfSk7XG5cbiAgICBjb25zdCBmcmFtZUludGVydmFsID0gMSAvIHRoaXMucHJvcHMuZnBzO1xuICAgIC8vIFJlbmRlciBlYWNoIGZyYW1lIGluIHRoZSBzZXF1ZW5jZVxuICAgIHRoaXMuX2NhbmNlbFRpbWVvdXRzKCk7XG4gICAgY29uc3QgdGljayA9ICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5wcm9wcy5yZWNvcmRpbmcpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIHRoaXMucHJvcHMuZGVsdGFUaW1lID0gZnJhbWVJbnRlcnZhbDtcbiAgICAgIHRoaXMudGljaygpO1xuICAgICAgcmV0dXJuIHRoaXMuZXhwb3J0RnJhbWUoZXhwb3J0T3B0cylcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5wcm9wcy5yZWNvcmRpbmcpIHJldHVybjsgLy8gd2FzIGNhbmNlbGxlZCBiZWZvcmVcbiAgICAgICAgICB0aGlzLnByb3BzLmRlbHRhVGltZSA9IDA7XG4gICAgICAgICAgdGhpcy5wcm9wcy5mcmFtZSsrO1xuICAgICAgICAgIGlmICh0aGlzLnByb3BzLmZyYW1lIDwgdGhpcy5wcm9wcy50b3RhbEZyYW1lcykge1xuICAgICAgICAgICAgdGhpcy5wcm9wcy50aW1lICs9IGZyYW1lSW50ZXJ2YWw7XG4gICAgICAgICAgICB0aGlzLnByb3BzLnBsYXloZWFkID0gdGhpcy5fY29tcHV0ZVBsYXloZWFkKHRoaXMucHJvcHMudGltZSwgdGhpcy5wcm9wcy5kdXJhdGlvbik7XG4gICAgICAgICAgICB0aGlzLl9yZWNvcmRUaW1lb3V0ID0gc2V0VGltZW91dCh0aWNrLCAwKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZpbmlzaGVkIHJlY29yZGluZycpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsRW5kKCk7XG4gICAgICAgICAgICB0aGlzLmVuZFJlY29yZCgpO1xuICAgICAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICAgICAgICB0aGlzLnJ1bigpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIFRyaWdnZXIgYSBzdGFydCBldmVudCBiZWZvcmUgd2UgYmVnaW4gcmVjb3JkaW5nXG4gICAgaWYgKCF0aGlzLnByb3BzLnN0YXJ0ZWQpIHtcbiAgICAgIHRoaXMuX3NpZ25hbEJlZ2luKCk7XG4gICAgICB0aGlzLnByb3BzLnN0YXJ0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIC8vIFRyaWdnZXIgJ2JlZ2luIHJlY29yZCcgZXZlbnRcbiAgICBpZiAodGhpcy5za2V0Y2ggJiYgdHlwZW9mIHRoaXMuc2tldGNoLmJlZ2luUmVjb3JkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aGlzLl93cmFwQ29udGV4dFNjYWxlKHByb3BzID0+IHRoaXMuc2tldGNoLmJlZ2luUmVjb3JkKHByb3BzKSk7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhdGUgYSBzdHJlYW1pbmcgc3RhcnQgaWYgbmVjZXNzYXJ5XG4gICAgc3RyZWFtU3RhcnQoZXhwb3J0T3B0cylcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICB0aGlzLl9yYWYgPSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRpY2spO1xuICAgICAgfSk7XG4gIH1cblxuICBfc2lnbmFsQmVnaW4gKCkge1xuICAgIGlmICh0aGlzLnNrZXRjaCAmJiB0eXBlb2YgdGhpcy5za2V0Y2guYmVnaW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuX3dyYXBDb250ZXh0U2NhbGUocHJvcHMgPT4gdGhpcy5za2V0Y2guYmVnaW4ocHJvcHMpKTtcbiAgICB9XG4gIH1cblxuICBfc2lnbmFsRW5kICgpIHtcbiAgICBpZiAodGhpcy5za2V0Y2ggJiYgdHlwZW9mIHRoaXMuc2tldGNoLmVuZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhpcy5fd3JhcENvbnRleHRTY2FsZShwcm9wcyA9PiB0aGlzLnNrZXRjaC5lbmQocHJvcHMpKTtcbiAgICB9XG4gIH1cblxuICBlbmRSZWNvcmQgKCkge1xuICAgIGNvbnN0IHdhc1JlY29yZGluZyA9IHRoaXMucHJvcHMucmVjb3JkaW5nO1xuXG4gICAgdGhpcy5fY2FuY2VsVGltZW91dHMoKTtcbiAgICB0aGlzLnByb3BzLnJlY29yZGluZyA9IGZhbHNlO1xuICAgIHRoaXMucHJvcHMuZGVsdGFUaW1lID0gMDtcbiAgICB0aGlzLnByb3BzLnBsYXlpbmcgPSBmYWxzZTtcblxuICAgIC8vIHRlbGwgQ0xJIHRoYXQgc3RyZWFtIGhhcyBmaW5pc2hlZFxuICAgIHJldHVybiBzdHJlYW1FbmQoKVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIC8vIFRyaWdnZXIgJ2VuZCByZWNvcmQnIGV2ZW50XG4gICAgICAgIGlmICh3YXNSZWNvcmRpbmcgJiYgdGhpcy5za2V0Y2ggJiYgdHlwZW9mIHRoaXMuc2tldGNoLmVuZFJlY29yZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHRoaXMuX3dyYXBDb250ZXh0U2NhbGUocHJvcHMgPT4gdGhpcy5za2V0Y2guZW5kUmVjb3JkKHByb3BzKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgX2NyZWF0ZUV4cG9ydE9wdGlvbnMgKG9wdCA9IHt9KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHNlcXVlbmNlOiBvcHQuc2VxdWVuY2UsXG4gICAgICBzYXZlOiBvcHQuc2F2ZSxcbiAgICAgIGZwczogdGhpcy5wcm9wcy5mcHMsXG4gICAgICBmcmFtZTogb3B0LnNlcXVlbmNlID8gdGhpcy5wcm9wcy5mcmFtZSA6IHVuZGVmaW5lZCxcbiAgICAgIGZpbGU6IHRoaXMuc2V0dGluZ3MuZmlsZSxcbiAgICAgIG5hbWU6IHRoaXMuc2V0dGluZ3MubmFtZSxcbiAgICAgIHByZWZpeDogdGhpcy5zZXR0aW5ncy5wcmVmaXgsXG4gICAgICBzdWZmaXg6IHRoaXMuc2V0dGluZ3Muc3VmZml4LFxuICAgICAgZW5jb2Rpbmc6IHRoaXMuc2V0dGluZ3MuZW5jb2RpbmcsXG4gICAgICBlbmNvZGluZ1F1YWxpdHk6IHRoaXMuc2V0dGluZ3MuZW5jb2RpbmdRdWFsaXR5LFxuICAgICAgdGltZVN0YW1wOiBvcHQudGltZVN0YW1wIHx8IGdldFRpbWVTdGFtcCgpLFxuICAgICAgdG90YWxGcmFtZXM6IGlzRmluaXRlKHRoaXMucHJvcHMudG90YWxGcmFtZXMpID8gTWF0aC5tYXgoMCwgdGhpcy5wcm9wcy50b3RhbEZyYW1lcykgOiAxMDAwXG4gICAgfTtcbiAgfVxuXG4gIGV4cG9ydEZyYW1lIChvcHQgPSB7fSkge1xuICAgIGlmICghdGhpcy5za2V0Y2gpIHJldHVybiBQcm9taXNlLmFsbChbXSk7XG4gICAgaWYgKHR5cGVvZiB0aGlzLnNrZXRjaC5wcmVFeHBvcnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuc2tldGNoLnByZUV4cG9ydCgpO1xuICAgIH1cblxuICAgIC8vIE9wdGlvbnMgZm9yIGV4cG9ydCBmdW5jdGlvblxuICAgIGxldCBleHBvcnRPcHRzID0gdGhpcy5fY3JlYXRlRXhwb3J0T3B0aW9ucyhvcHQpO1xuXG4gICAgY29uc3QgY2xpZW50ID0gZ2V0Q2xpZW50QVBJKCk7XG4gICAgbGV0IHAgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBpZiAoY2xpZW50ICYmIG9wdC5jb21taXQgJiYgdHlwZW9mIGNsaWVudC5jb21taXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IGNvbW1pdE9wdHMgPSBhc3NpZ24oe30sIGV4cG9ydE9wdHMpO1xuICAgICAgY29uc3QgaGFzaCA9IGNsaWVudC5jb21taXQoY29tbWl0T3B0cyk7XG4gICAgICBpZiAoaXNQcm9taXNlKGhhc2gpKSBwID0gaGFzaDtcbiAgICAgIGVsc2UgcCA9IFByb21pc2UucmVzb2x2ZShoYXNoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcC50aGVuKGhhc2ggPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX2RvRXhwb3J0RnJhbWUoYXNzaWduKHt9LCBleHBvcnRPcHRzLCB7IGhhc2g6IGhhc2ggfHwgJycgfSkpO1xuICAgIH0pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIC8vIE1vc3QgY29tbW9uIHVzZWNhc2UgaXMgdG8gZXhwb3J0IGEgc2luZ2xlIGxheWVyLFxuICAgICAgLy8gc28gbGV0J3Mgb3B0aW1pemUgdGhlIHVzZXIgZXhwZXJpZW5jZSBmb3IgdGhhdC5cbiAgICAgIGlmIChyZXN1bHQubGVuZ3RoID09PSAxKSByZXR1cm4gcmVzdWx0WzBdO1xuICAgICAgZWxzZSByZXR1cm4gcmVzdWx0O1xuICAgIH0pO1xuICB9XG5cbiAgX2RvRXhwb3J0RnJhbWUgKGV4cG9ydE9wdHMgPSB7fSkge1xuICAgIHRoaXMuX3Byb3BzLmV4cG9ydGluZyA9IHRydWU7XG5cbiAgICAvLyBSZXNpemUgdG8gb3V0cHV0IHJlc29sdXRpb25cbiAgICB0aGlzLnJlc2l6ZSgpO1xuXG4gICAgLy8gRHJhdyBhdCB0aGlzIG91dHB1dCByZXNvbHV0aW9uXG4gICAgbGV0IGRyYXdSZXN1bHQgPSB0aGlzLnJlbmRlcigpO1xuXG4gICAgLy8gVGhlIHNlbGYgb3duZWQgY2FudmFzIChtYXkgYmUgdW5kZWZpbmVkLi4uISlcbiAgICBjb25zdCBjYW52YXMgPSB0aGlzLnByb3BzLmNhbnZhcztcblxuICAgIC8vIEdldCBsaXN0IG9mIHJlc3VsdHMgZnJvbSByZW5kZXJcbiAgICBpZiAodHlwZW9mIGRyYXdSZXN1bHQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBkcmF3UmVzdWx0ID0gWyBjYW52YXMgXTtcbiAgICB9XG4gICAgZHJhd1Jlc3VsdCA9IFtdLmNvbmNhdChkcmF3UmVzdWx0KS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgICAvLyBUcmFuc2Zvcm0gdGhlIGNhbnZhcy9maWxlIGRlc2NyaXB0b3JzIGludG8gYSBjb25zaXN0ZW50IGZvcm1hdCxcbiAgICAvLyBhbmQgcHVsbCBvdXQgYW55IGRhdGEgVVJMcyBmcm9tIGNhbnZhcyBlbGVtZW50c1xuICAgIGRyYXdSZXN1bHQgPSBkcmF3UmVzdWx0Lm1hcChyZXN1bHQgPT4ge1xuICAgICAgY29uc3QgaGFzRGF0YU9iamVjdCA9IHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmIHJlc3VsdCAmJiAoJ2RhdGEnIGluIHJlc3VsdCB8fCAnZGF0YVVSTCcgaW4gcmVzdWx0KTtcbiAgICAgIGNvbnN0IGRhdGEgPSBoYXNEYXRhT2JqZWN0ID8gcmVzdWx0LmRhdGEgOiByZXN1bHQ7XG4gICAgICBjb25zdCBvcHRzID0gaGFzRGF0YU9iamVjdCA/IGFzc2lnbih7fSwgcmVzdWx0LCB7IGRhdGEgfSkgOiB7IGRhdGEgfTtcbiAgICAgIGlmIChpc0NhbnZhcyhkYXRhKSkge1xuICAgICAgICBjb25zdCBlbmNvZGluZyA9IG9wdHMuZW5jb2RpbmcgfHwgZXhwb3J0T3B0cy5lbmNvZGluZztcbiAgICAgICAgY29uc3QgZW5jb2RpbmdRdWFsaXR5ID0gZGVmaW5lZChvcHRzLmVuY29kaW5nUXVhbGl0eSwgZXhwb3J0T3B0cy5lbmNvZGluZ1F1YWxpdHksIDAuOTUpO1xuICAgICAgICBjb25zdCB7IGRhdGFVUkwsIGV4dGVuc2lvbiwgdHlwZSB9ID0gZXhwb3J0Q2FudmFzKGRhdGEsIHsgZW5jb2RpbmcsIGVuY29kaW5nUXVhbGl0eSB9KTtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ob3B0cywgeyBkYXRhVVJMLCBleHRlbnNpb24sIHR5cGUgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gb3B0cztcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIE5vdyByZXR1cm4gdG8gcmVndWxhciByZW5kZXJpbmcgbW9kZVxuICAgIHRoaXMuX3Byb3BzLmV4cG9ydGluZyA9IGZhbHNlO1xuICAgIHRoaXMucmVzaXplKCk7XG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIC8vIEFuZCBub3cgd2UgY2FuIHNhdmUgZWFjaCByZXN1bHRcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoZHJhd1Jlc3VsdC5tYXAoKHJlc3VsdCwgaSwgbGF5ZXJMaXN0KSA9PiB7XG4gICAgICAvLyBCeSBkZWZhdWx0LCBpZiByZW5kZXJpbmcgbXVsdGlwbGUgbGF5ZXJzIHdlIHdpbGwgZ2l2ZSB0aGVtIGluZGljZXNcbiAgICAgIGNvbnN0IGN1ck9wdCA9IGFzc2lnbih7XG4gICAgICAgIGV4dGVuc2lvbjogJycsXG4gICAgICAgIHByZWZpeDogJycsXG4gICAgICAgIHN1ZmZpeDogJydcbiAgICAgIH0sIGV4cG9ydE9wdHMsIHJlc3VsdCwge1xuICAgICAgICBsYXllcjogaSxcbiAgICAgICAgdG90YWxMYXllcnM6IGxheWVyTGlzdC5sZW5ndGhcbiAgICAgIH0pO1xuXG4gICAgICAvLyBJZiBleHBvcnQgaXMgZXhwbGljaXRseSBub3Qgc2F2aW5nLCBtYWtlIHN1cmUgbm90aGluZyBzYXZlc1xuICAgICAgLy8gT3RoZXJ3aXNlIGRlZmF1bHQgdG8gdGhlIGxheWVyIHNhdmUgb3B0aW9uLCBvciBmYWxsYmFjayB0byB0cnVlXG4gICAgICBjb25zdCBzYXZlUGFyYW0gPSBleHBvcnRPcHRzLnNhdmUgPT09IGZhbHNlID8gZmFsc2UgOiByZXN1bHQuc2F2ZTtcbiAgICAgIGN1ck9wdC5zYXZlID0gc2F2ZVBhcmFtICE9PSBmYWxzZTtcblxuICAgICAgLy8gUmVzb2x2ZSBhIGZ1bGwgZmlsZW5hbWUgZnJvbSBhbGwgdGhlIG9wdGlvbnNcbiAgICAgIGN1ck9wdC5maWxlbmFtZSA9IHJlc29sdmVGaWxlbmFtZShjdXJPcHQpO1xuXG4gICAgICAvLyBDbGVhbiB1cCBzb21lIHBhcmFtZXRlcnMgdGhhdCBtYXkgYmUgYW1iaWd1b3VzIHRvIHRoZSB1c2VyXG4gICAgICBkZWxldGUgY3VyT3B0LmVuY29kaW5nO1xuICAgICAgZGVsZXRlIGN1ck9wdC5lbmNvZGluZ1F1YWxpdHk7XG5cbiAgICAgIC8vIENsZWFuIGl0IHVwIGZ1cnRoZXIgYnkganVzdCByZW1vdmluZyB1bmRlZmluZWQgdmFsdWVzXG4gICAgICBmb3IgKGxldCBrIGluIGN1ck9wdCkge1xuICAgICAgICBpZiAodHlwZW9mIGN1ck9wdFtrXSA9PT0gJ3VuZGVmaW5lZCcpIGRlbGV0ZSBjdXJPcHRba107XG4gICAgICB9XG5cbiAgICAgIGxldCBzYXZlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICBpZiAoY3VyT3B0LnNhdmUpIHtcbiAgICAgICAgLy8gV2hldGhlciB0byBhY3R1YWxseSBzYXZlIChkb3dubG9hZCkgdGhpcyBmcmFnbWVudFxuICAgICAgICBjb25zdCBkYXRhID0gY3VyT3B0LmRhdGE7XG4gICAgICAgIGlmIChjdXJPcHQuZGF0YVVSTCkge1xuICAgICAgICAgIGNvbnN0IGRhdGFVUkwgPSBjdXJPcHQuZGF0YVVSTDtcbiAgICAgICAgICBzYXZlUHJvbWlzZSA9IHNhdmVEYXRhVVJMKGRhdGFVUkwsIGN1ck9wdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2F2ZVByb21pc2UgPSBzYXZlRmlsZShkYXRhLCBjdXJPcHQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gc2F2ZVByb21pc2UudGhlbihzYXZlUmVzdWx0ID0+IHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIGN1ck9wdCwgc2F2ZVJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9KSkudGhlbihldiA9PiB7XG4gICAgICBjb25zdCBzYXZlZEV2ZW50cyA9IGV2LmZpbHRlcihlID0+IGUuc2F2ZSk7XG4gICAgICBpZiAoc2F2ZWRFdmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBMb2cgdGhlIHNhdmVkIGV4cG9ydHNcbiAgICAgICAgY29uc3QgZXZlbnRXaXRoT3V0cHV0ID0gc2F2ZWRFdmVudHMuZmluZChlID0+IGUub3V0cHV0TmFtZSk7XG4gICAgICAgIGNvbnN0IGlzQ2xpZW50ID0gc2F2ZWRFdmVudHMuc29tZShlID0+IGUuY2xpZW50KTtcbiAgICAgICAgY29uc3QgaXNTdHJlYW1pbmcgPSBzYXZlZEV2ZW50cy5zb21lKGUgPT4gZS5zdHJlYW0pO1xuICAgICAgICBsZXQgaXRlbTtcbiAgICAgICAgLy8gbWFueSBmaWxlcywganVzdCBsb2cgaG93IG1hbnkgd2VyZSBleHBvcnRlZFxuICAgICAgICBpZiAoc2F2ZWRFdmVudHMubGVuZ3RoID4gMSkgaXRlbSA9IHNhdmVkRXZlbnRzLmxlbmd0aDtcbiAgICAgICAgLy8gaW4gQ0xJLCB3ZSBrbm93IGV4YWN0IHBhdGggZGlybmFtZVxuICAgICAgICBlbHNlIGlmIChldmVudFdpdGhPdXRwdXQpIGl0ZW0gPSBgJHtldmVudFdpdGhPdXRwdXQub3V0cHV0TmFtZX0vJHtzYXZlZEV2ZW50c1swXS5maWxlbmFtZX1gO1xuICAgICAgICAvLyBpbiBicm93c2VyLCB3ZSBjYW4gb25seSBrbm93IGl0IHdlbnQgdG8gXCJicm93c2VyIGRvd25sb2FkIGZvbGRlclwiXG4gICAgICAgIGVsc2UgaXRlbSA9IGAke3NhdmVkRXZlbnRzWzBdLmZpbGVuYW1lfWA7XG4gICAgICAgIGxldCBvZlNlcSA9ICcnO1xuICAgICAgICBpZiAoZXhwb3J0T3B0cy5zZXF1ZW5jZSkge1xuICAgICAgICAgIGNvbnN0IGhhc1RvdGFsRnJhbWVzID0gaXNGaW5pdGUodGhpcy5wcm9wcy50b3RhbEZyYW1lcyk7XG4gICAgICAgICAgb2ZTZXEgPSBoYXNUb3RhbEZyYW1lcyA/IGAgKGZyYW1lICR7ZXhwb3J0T3B0cy5mcmFtZSArIDF9IC8gJHt0aGlzLnByb3BzLnRvdGFsRnJhbWVzfSlgIDogYCAoZnJhbWUgJHtleHBvcnRPcHRzLmZyYW1lfSlgO1xuICAgICAgICB9IGVsc2UgaWYgKHNhdmVkRXZlbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBvZlNlcSA9IGAgZmlsZXNgO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IGlzQ2xpZW50ID8gJ2NhbnZhcy1za2V0Y2gtY2xpJyA6ICdjYW52YXMtc2tldGNoJztcbiAgICAgICAgY29uc3QgYWN0aW9uID0gaXNTdHJlYW1pbmcgPyAnU3RyZWFtaW5nIGludG8nIDogJ0V4cG9ydGVkJztcbiAgICAgICAgY29uc29sZS5sb2coYCVjWyR7Y2xpZW50fV0lYyAke2FjdGlvbn0gJWMke2l0ZW19JWMke29mU2VxfWAsICdjb2xvcjogIzhlOGU4ZTsnLCAnY29sb3I6IGluaXRpYWw7JywgJ2ZvbnQtd2VpZ2h0OiBib2xkOycsICdmb250LXdlaWdodDogaW5pdGlhbDsnKTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5za2V0Y2gucG9zdEV4cG9ydCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLnNrZXRjaC5wb3N0RXhwb3J0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZXY7XG4gICAgfSk7XG4gIH1cblxuICBfd3JhcENvbnRleHRTY2FsZSAoY2IpIHtcbiAgICB0aGlzLl9wcmVSZW5kZXIoKTtcbiAgICBjYih0aGlzLnByb3BzKTtcbiAgICB0aGlzLl9wb3N0UmVuZGVyKCk7XG4gIH1cblxuICBfcHJlUmVuZGVyICgpIHtcbiAgICBjb25zdCBwcm9wcyA9IHRoaXMucHJvcHM7XG5cbiAgICAvLyBTY2FsZSBjb250ZXh0IGZvciB1bml0IHNpemluZ1xuICAgIGlmICghdGhpcy5wcm9wcy5nbCAmJiBwcm9wcy5jb250ZXh0ICYmICFwcm9wcy5wNSkge1xuICAgICAgcHJvcHMuY29udGV4dC5zYXZlKCk7XG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5zY2FsZUNvbnRleHQgIT09IGZhbHNlKSB7XG4gICAgICAgIHByb3BzLmNvbnRleHQuc2NhbGUocHJvcHMuc2NhbGVYLCBwcm9wcy5zY2FsZVkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocHJvcHMucDUpIHtcbiAgICAgIHByb3BzLnA1LnNjYWxlKHByb3BzLnNjYWxlWCAvIHByb3BzLnBpeGVsUmF0aW8sIHByb3BzLnNjYWxlWSAvIHByb3BzLnBpeGVsUmF0aW8pO1xuICAgIH1cbiAgfVxuXG4gIF9wb3N0UmVuZGVyICgpIHtcbiAgICBjb25zdCBwcm9wcyA9IHRoaXMucHJvcHM7XG5cbiAgICBpZiAoIXRoaXMucHJvcHMuZ2wgJiYgcHJvcHMuY29udGV4dCAmJiAhcHJvcHMucDUpIHtcbiAgICAgIHByb3BzLmNvbnRleHQucmVzdG9yZSgpO1xuICAgIH1cblxuICAgIC8vIEZsdXNoIGJ5IGRlZmF1bHQsIHRoaXMgbWF5IGJlIHJldmlzaXRlZCBhdCBhIGxhdGVyIHBvaW50LlxuICAgIC8vIFdlIGRvIHRoaXMgdG8gZW5zdXJlIHRvRGF0YVVSTCBjYW4gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IGFmdGVyLlxuICAgIC8vIE1vc3QgbGlrZWx5IGJyb3dzZXJzIGFscmVhZHkgaGFuZGxlIHRoaXMsIHNvIHdlIG1heSByZXZpc2l0IHRoaXMgYW5kXG4gICAgLy8gcmVtb3ZlIGl0IGlmIGl0IGltcHJvdmVzIHBlcmZvcm1hbmNlIHdpdGhvdXQgYW55IHVzYWJpbGl0eSBpc3N1ZXMuXG4gICAgaWYgKHByb3BzLmdsICYmIHRoaXMuc2V0dGluZ3MuZmx1c2ggIT09IGZhbHNlICYmICFwcm9wcy5wNSkge1xuICAgICAgcHJvcHMuZ2wuZmx1c2goKTtcbiAgICB9XG4gIH1cblxuICB0aWNrICgpIHtcbiAgICBpZiAodGhpcy5za2V0Y2ggJiYgdHlwZW9mIHRoaXMuc2tldGNoLnRpY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuX3ByZVJlbmRlcigpO1xuICAgICAgdGhpcy5za2V0Y2gudGljayh0aGlzLnByb3BzKTtcbiAgICAgIHRoaXMuX3Bvc3RSZW5kZXIoKTtcbiAgICB9XG4gIH1cblxuICByZW5kZXIgKCkge1xuICAgIGlmICh0aGlzLnByb3BzLnA1KSB7XG4gICAgICB0aGlzLl9sYXN0UmVkcmF3UmVzdWx0ID0gdW5kZWZpbmVkO1xuICAgICAgdGhpcy5wcm9wcy5wNS5yZWRyYXcoKTtcbiAgICAgIHJldHVybiB0aGlzLl9sYXN0UmVkcmF3UmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5zdWJtaXREcmF3Q2FsbCgpO1xuICAgIH1cbiAgfVxuXG4gIHN1Ym1pdERyYXdDYWxsICgpIHtcbiAgICBpZiAoIXRoaXMuc2tldGNoKSByZXR1cm47XG5cbiAgICBjb25zdCBwcm9wcyA9IHRoaXMucHJvcHM7XG4gICAgdGhpcy5fcHJlUmVuZGVyKCk7XG5cbiAgICBsZXQgZHJhd1Jlc3VsdDtcblxuICAgIGlmICh0eXBlb2YgdGhpcy5za2V0Y2ggPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGRyYXdSZXN1bHQgPSB0aGlzLnNrZXRjaChwcm9wcyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGhpcy5za2V0Y2gucmVuZGVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBkcmF3UmVzdWx0ID0gdGhpcy5za2V0Y2gucmVuZGVyKHByb3BzKTtcbiAgICB9XG5cbiAgICB0aGlzLl9wb3N0UmVuZGVyKCk7XG5cbiAgICByZXR1cm4gZHJhd1Jlc3VsdDtcbiAgfVxuXG4gIHVwZGF0ZSAob3B0ID0ge30pIHtcbiAgICAvLyBDdXJyZW50bHkgdXBkYXRlKCkgaXMgb25seSBmb2N1c2VkIG9uIHJlc2l6aW5nLFxuICAgIC8vIGJ1dCBsYXRlciB3ZSB3aWxsIHN1cHBvcnQgb3RoZXIgb3B0aW9ucyBsaWtlIHN3aXRjaGluZ1xuICAgIC8vIGZyYW1lcyBhbmQgc3VjaC5cbiAgICBjb25zdCBub3RZZXRTdXBwb3J0ZWQgPSBbXG4gICAgICAnYW5pbWF0ZSdcbiAgICBdO1xuXG4gICAgT2JqZWN0LmtleXMob3B0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAobm90WWV0U3VwcG9ydGVkLmluZGV4T2Yoa2V5KSA+PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgU29ycnksIHRoZSB7ICR7a2V5fSB9IG9wdGlvbiBpcyBub3QgeWV0IHN1cHBvcnRlZCB3aXRoIHVwZGF0ZSgpLmApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgb2xkQ2FudmFzID0gdGhpcy5fc2V0dGluZ3MuY2FudmFzO1xuICAgIGNvbnN0IG9sZENvbnRleHQgPSB0aGlzLl9zZXR0aW5ncy5jb250ZXh0O1xuXG4gICAgLy8gTWVyZ2UgbmV3IG9wdGlvbnMgaW50byBzZXR0aW5nc1xuICAgIGZvciAobGV0IGtleSBpbiBvcHQpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gb3B0W2tleV07XG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAndW5kZWZpbmVkJykgeyAvLyBpZ25vcmUgdW5kZWZpbmVkXG4gICAgICAgIHRoaXMuX3NldHRpbmdzW2tleV0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBNZXJnZSBpbiB0aW1lIHByb3BzXG4gICAgY29uc3QgdGltZU9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9zZXR0aW5ncywgb3B0KTtcbiAgICBpZiAoJ3RpbWUnIGluIG9wdCAmJiAnZnJhbWUnIGluIG9wdCkgdGhyb3cgbmV3IEVycm9yKCdZb3Ugc2hvdWxkIHNwZWNpZnkgeyB0aW1lIH0gb3IgeyBmcmFtZSB9IGJ1dCBub3QgYm90aCcpO1xuICAgIGVsc2UgaWYgKCd0aW1lJyBpbiBvcHQpIGRlbGV0ZSB0aW1lT3B0cy5mcmFtZTtcbiAgICBlbHNlIGlmICgnZnJhbWUnIGluIG9wdCkgZGVsZXRlIHRpbWVPcHRzLnRpbWU7XG4gICAgaWYgKCdkdXJhdGlvbicgaW4gb3B0ICYmICd0b3RhbEZyYW1lcycgaW4gb3B0KSB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBzaG91bGQgc3BlY2lmeSB7IGR1cmF0aW9uIH0gb3IgeyB0b3RhbEZyYW1lcyB9IGJ1dCBub3QgYm90aCcpO1xuICAgIGVsc2UgaWYgKCdkdXJhdGlvbicgaW4gb3B0KSBkZWxldGUgdGltZU9wdHMudG90YWxGcmFtZXM7XG4gICAgZWxzZSBpZiAoJ3RvdGFsRnJhbWVzJyBpbiBvcHQpIGRlbGV0ZSB0aW1lT3B0cy5kdXJhdGlvbjtcblxuICAgIC8vIE1lcmdlIGluIHVzZXIgZGF0YSB3aXRob3V0IGNvcHlpbmdcbiAgICBpZiAoJ2RhdGEnIGluIG9wdCkgdGhpcy5fcHJvcHMuZGF0YSA9IG9wdC5kYXRhO1xuXG4gICAgY29uc3QgdGltZVByb3BzID0gdGhpcy5nZXRUaW1lUHJvcHModGltZU9wdHMpO1xuICAgIE9iamVjdC5hc3NpZ24odGhpcy5fcHJvcHMsIHRpbWVQcm9wcyk7XG5cbiAgICAvLyBJZiBlaXRoZXIgY2FudmFzIG9yIGNvbnRleHQgaXMgY2hhbmdlZCwgd2Ugc2hvdWxkIHJlLXVwZGF0ZVxuICAgIGlmIChvbGRDYW52YXMgIT09IHRoaXMuX3NldHRpbmdzLmNhbnZhcyB8fCBvbGRDb250ZXh0ICE9PSB0aGlzLl9zZXR0aW5ncy5jb250ZXh0KSB7XG4gICAgICBjb25zdCB7IGNhbnZhcywgY29udGV4dCB9ID0gY3JlYXRlQ2FudmFzKHRoaXMuX3NldHRpbmdzKTtcblxuICAgICAgdGhpcy5wcm9wcy5jYW52YXMgPSBjYW52YXM7XG4gICAgICB0aGlzLnByb3BzLmNvbnRleHQgPSBjb250ZXh0O1xuXG4gICAgICAvLyBEZWxldGUgb3IgYWRkIGEgJ2dsJyBwcm9wIGZvciBjb252ZW5pZW5jZVxuICAgICAgdGhpcy5fc2V0dXBHTEtleSgpO1xuXG4gICAgICAvLyBSZS1tb3VudCB0aGUgbmV3IGNhbnZhcyBpZiBpdCBoYXMgbm8gcGFyZW50XG4gICAgICB0aGlzLl9hcHBlbmRDYW52YXNJZk5lZWRlZCgpO1xuICAgIH1cblxuICAgIC8vIFNwZWNpYWwgY2FzZSB0byBzdXBwb3J0IFA1LmpzXG4gICAgaWYgKG9wdC5wNSAmJiB0eXBlb2Ygb3B0LnA1ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aGlzLnByb3BzLnA1ID0gb3B0LnA1O1xuICAgICAgdGhpcy5wcm9wcy5wNS5kcmF3ID0gKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5faXNQNVJlc2l6aW5nKSByZXR1cm47XG4gICAgICAgIHRoaXMuX2xhc3RSZWRyYXdSZXN1bHQgPSB0aGlzLnN1Ym1pdERyYXdDYWxsKCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBwbGF5aW5nIHN0YXRlIGlmIG5lY2Vzc2FyeVxuICAgIGlmICgncGxheWluZycgaW4gb3B0KSB7XG4gICAgICBpZiAob3B0LnBsYXlpbmcpIHRoaXMucGxheSgpO1xuICAgICAgZWxzZSB0aGlzLnBhdXNlKCk7XG4gICAgfVxuXG4gICAgY2hlY2tTZXR0aW5ncyh0aGlzLl9zZXR0aW5ncyk7XG5cbiAgICAvLyBEcmF3IG5ldyBmcmFtZVxuICAgIHRoaXMucmVzaXplKCk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICByZXR1cm4gdGhpcy5wcm9wcztcbiAgfVxuXG4gIHJlc2l6ZSAoKSB7XG4gICAgY29uc3Qgb2xkU2l6ZXMgPSB0aGlzLl9nZXRTaXplUHJvcHMoKTtcblxuICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy5zZXR0aW5ncztcbiAgICBjb25zdCBwcm9wcyA9IHRoaXMucHJvcHM7XG5cbiAgICAvLyBSZWNvbXB1dGUgbmV3IHByb3BlcnRpZXMgYmFzZWQgb24gY3VycmVudCBzZXR1cFxuICAgIGNvbnN0IG5ld1Byb3BzID0gcmVzaXplQ2FudmFzKHByb3BzLCBzZXR0aW5ncyk7XG5cbiAgICAvLyBBc3NpZ24gdG8gY3VycmVudCBwcm9wc1xuICAgIE9iamVjdC5hc3NpZ24odGhpcy5fcHJvcHMsIG5ld1Byb3BzKTtcblxuICAgIC8vIE5vdyB3ZSBhY3R1YWxseSB1cGRhdGUgdGhlIGNhbnZhcyB3aWR0aC9oZWlnaHQgYW5kIHN0eWxlIHByb3BzXG4gICAgY29uc3Qge1xuICAgICAgcGl4ZWxSYXRpbyxcbiAgICAgIGNhbnZhc1dpZHRoLFxuICAgICAgY2FudmFzSGVpZ2h0LFxuICAgICAgc3R5bGVXaWR0aCxcbiAgICAgIHN0eWxlSGVpZ2h0XG4gICAgfSA9IHRoaXMucHJvcHM7XG5cbiAgICAvLyBVcGRhdGUgY2FudmFzIHNldHRpbmdzXG4gICAgY29uc3QgY2FudmFzID0gdGhpcy5wcm9wcy5jYW52YXM7XG4gICAgaWYgKGNhbnZhcyAmJiBzZXR0aW5ncy5yZXNpemVDYW52YXMgIT09IGZhbHNlKSB7XG4gICAgICBpZiAocHJvcHMucDUpIHtcbiAgICAgICAgLy8gUDUuanMgc3BlY2lmaWMgZWRnZSBjYXNlXG4gICAgICAgIGlmIChjYW52YXMud2lkdGggIT09IGNhbnZhc1dpZHRoIHx8IGNhbnZhcy5oZWlnaHQgIT09IGNhbnZhc0hlaWdodCkge1xuICAgICAgICAgIHRoaXMuX2lzUDVSZXNpemluZyA9IHRydWU7XG4gICAgICAgICAgLy8gVGhpcyBjYXVzZXMgYSByZS1kcmF3IDpcXCBzbyB3ZSBpZ25vcmUgZHJhd3MgaW4gdGhlIG1lYW4gdGltZS4uLiBzb3J0YSBoYWNreVxuICAgICAgICAgIHByb3BzLnA1LnBpeGVsRGVuc2l0eShwaXhlbFJhdGlvKTtcbiAgICAgICAgICBwcm9wcy5wNS5yZXNpemVDYW52YXMoY2FudmFzV2lkdGggLyBwaXhlbFJhdGlvLCBjYW52YXNIZWlnaHQgLyBwaXhlbFJhdGlvLCBmYWxzZSk7XG4gICAgICAgICAgdGhpcy5faXNQNVJlc2l6aW5nID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZvcmNlIGNhbnZhcyBzaXplXG4gICAgICAgIGlmIChjYW52YXMud2lkdGggIT09IGNhbnZhc1dpZHRoKSBjYW52YXMud2lkdGggPSBjYW52YXNXaWR0aDtcbiAgICAgICAgaWYgKGNhbnZhcy5oZWlnaHQgIT09IGNhbnZhc0hlaWdodCkgY2FudmFzLmhlaWdodCA9IGNhbnZhc0hlaWdodDtcbiAgICAgIH1cbiAgICAgIC8vIFVwZGF0ZSBjYW52YXMgc3R5bGVcbiAgICAgIGlmIChpc0Jyb3dzZXIoKSAmJiBzZXR0aW5ncy5zdHlsZUNhbnZhcyAhPT0gZmFsc2UpIHtcbiAgICAgICAgY2FudmFzLnN0eWxlLndpZHRoID0gYCR7c3R5bGVXaWR0aH1weGA7XG4gICAgICAgIGNhbnZhcy5zdHlsZS5oZWlnaHQgPSBgJHtzdHlsZUhlaWdodH1weGA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbmV3U2l6ZXMgPSB0aGlzLl9nZXRTaXplUHJvcHMoKTtcbiAgICBsZXQgY2hhbmdlZCA9ICFkZWVwRXF1YWwob2xkU2l6ZXMsIG5ld1NpemVzKTtcbiAgICBpZiAoY2hhbmdlZCkge1xuICAgICAgdGhpcy5fc2l6ZUNoYW5nZWQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGNoYW5nZWQ7XG4gIH1cblxuICBfc2l6ZUNoYW5nZWQgKCkge1xuICAgIC8vIFNlbmQgcmVzaXplIGV2ZW50IHRvIHNrZXRjaFxuICAgIGlmICh0aGlzLnNrZXRjaCAmJiB0eXBlb2YgdGhpcy5za2V0Y2gucmVzaXplID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aGlzLnNrZXRjaC5yZXNpemUodGhpcy5wcm9wcyk7XG4gICAgfVxuICB9XG5cbiAgYW5pbWF0ZSAoKSB7XG4gICAgaWYgKCF0aGlzLnByb3BzLnBsYXlpbmcpIHJldHVybjtcbiAgICBpZiAoIWlzQnJvd3NlcigpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdbY2FudmFzLXNrZXRjaF0gV0FSTjogQW5pbWF0aW9uIGluIE5vZGUuanMgaXMgbm90IHlldCBzdXBwb3J0ZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fcmFmID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLl9hbmltYXRlSGFuZGxlcik7XG5cbiAgICBsZXQgbm93ID0gcmlnaHROb3coKTtcblxuICAgIGNvbnN0IGZwcyA9IHRoaXMucHJvcHMuZnBzO1xuICAgIGNvbnN0IGZyYW1lSW50ZXJ2YWxNUyA9IDEwMDAgLyBmcHM7XG4gICAgbGV0IGRlbHRhVGltZU1TID0gbm93IC0gdGhpcy5fbGFzdFRpbWU7XG5cbiAgICBjb25zdCBkdXJhdGlvbiA9IHRoaXMucHJvcHMuZHVyYXRpb247XG4gICAgY29uc3QgaGFzRHVyYXRpb24gPSB0eXBlb2YgZHVyYXRpb24gPT09ICdudW1iZXInICYmIGlzRmluaXRlKGR1cmF0aW9uKTtcblxuICAgIGxldCBpc05ld0ZyYW1lID0gdHJ1ZTtcbiAgICBjb25zdCBwbGF5YmFja1JhdGUgPSB0aGlzLnNldHRpbmdzLnBsYXliYWNrUmF0ZTtcbiAgICBpZiAocGxheWJhY2tSYXRlID09PSAnZml4ZWQnKSB7XG4gICAgICBkZWx0YVRpbWVNUyA9IGZyYW1lSW50ZXJ2YWxNUztcbiAgICB9IGVsc2UgaWYgKHBsYXliYWNrUmF0ZSA9PT0gJ3Rocm90dGxlJykge1xuICAgICAgaWYgKGRlbHRhVGltZU1TID4gZnJhbWVJbnRlcnZhbE1TKSB7XG4gICAgICAgIG5vdyA9IG5vdyAtIChkZWx0YVRpbWVNUyAlIGZyYW1lSW50ZXJ2YWxNUyk7XG4gICAgICAgIHRoaXMuX2xhc3RUaW1lID0gbm93O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaXNOZXdGcmFtZSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9sYXN0VGltZSA9IG5vdztcbiAgICB9XG5cbiAgICBjb25zdCBkZWx0YVRpbWUgPSBkZWx0YVRpbWVNUyAvIDEwMDA7XG4gICAgbGV0IG5ld1RpbWUgPSB0aGlzLnByb3BzLnRpbWUgKyBkZWx0YVRpbWUgKiB0aGlzLnByb3BzLnRpbWVTY2FsZTtcblxuICAgIC8vIEhhbmRsZSByZXZlcnNlIHRpbWUgc2NhbGVcbiAgICBpZiAobmV3VGltZSA8IDAgJiYgaGFzRHVyYXRpb24pIHtcbiAgICAgIG5ld1RpbWUgPSBkdXJhdGlvbiArIG5ld1RpbWU7XG4gICAgfVxuXG4gICAgLy8gUmUtc3RhcnQgYW5pbWF0aW9uXG4gICAgbGV0IGlzRmluaXNoZWQgPSBmYWxzZTtcbiAgICBsZXQgaXNMb29wU3RhcnQgPSBmYWxzZTtcblxuICAgIGNvbnN0IGxvb3BpbmcgPSB0aGlzLnNldHRpbmdzLmxvb3AgIT09IGZhbHNlO1xuXG4gICAgaWYgKGhhc0R1cmF0aW9uICYmIG5ld1RpbWUgPj0gZHVyYXRpb24pIHtcbiAgICAgIC8vIFJlLXN0YXJ0IGFuaW1hdGlvblxuICAgICAgaWYgKGxvb3BpbmcpIHtcbiAgICAgICAgaXNOZXdGcmFtZSA9IHRydWU7XG4gICAgICAgIG5ld1RpbWUgPSBuZXdUaW1lICUgZHVyYXRpb247XG4gICAgICAgIGlzTG9vcFN0YXJ0ID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlzTmV3RnJhbWUgPSBmYWxzZTtcbiAgICAgICAgbmV3VGltZSA9IGR1cmF0aW9uO1xuICAgICAgICBpc0ZpbmlzaGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fc2lnbmFsRW5kKCk7XG4gICAgfVxuXG4gICAgaWYgKGlzTmV3RnJhbWUpIHtcbiAgICAgIHRoaXMucHJvcHMuZGVsdGFUaW1lID0gZGVsdGFUaW1lO1xuICAgICAgdGhpcy5wcm9wcy50aW1lID0gbmV3VGltZTtcbiAgICAgIHRoaXMucHJvcHMucGxheWhlYWQgPSB0aGlzLl9jb21wdXRlUGxheWhlYWQobmV3VGltZSwgZHVyYXRpb24pO1xuICAgICAgY29uc3QgbGFzdEZyYW1lID0gdGhpcy5wcm9wcy5mcmFtZTtcbiAgICAgIHRoaXMucHJvcHMuZnJhbWUgPSB0aGlzLl9jb21wdXRlQ3VycmVudEZyYW1lKCk7XG4gICAgICBpZiAoaXNMb29wU3RhcnQpIHRoaXMuX3NpZ25hbEJlZ2luKCk7XG4gICAgICBpZiAobGFzdEZyYW1lICE9PSB0aGlzLnByb3BzLmZyYW1lKSB0aGlzLnRpY2soKTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICB0aGlzLnByb3BzLmRlbHRhVGltZSA9IDA7XG4gICAgfVxuXG4gICAgaWYgKGlzRmluaXNoZWQpIHtcbiAgICAgIHRoaXMucGF1c2UoKTtcbiAgICB9XG4gIH1cblxuICBkaXNwYXRjaCAoY2IpIHtcbiAgICBpZiAodHlwZW9mIGNiICE9PSAnZnVuY3Rpb24nKSB0aHJvdyBuZXcgRXJyb3IoJ211c3QgcGFzcyBmdW5jdGlvbiBpbnRvIGRpc3BhdGNoKCknKTtcbiAgICBjYih0aGlzLnByb3BzKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICB9XG5cbiAgbW91bnQgKCkge1xuICAgIHRoaXMuX2FwcGVuZENhbnZhc0lmTmVlZGVkKCk7XG4gIH1cblxuICB1bm1vdW50ICgpIHtcbiAgICBpZiAoaXNCcm93c2VyKCkpIHtcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLl9yZXNpemVIYW5kbGVyKTtcbiAgICAgIHRoaXMuX2tleWJvYXJkU2hvcnRjdXRzLmRldGFjaCgpO1xuICAgIH1cbiAgICBpZiAodGhpcy5wcm9wcy5jYW52YXMucGFyZW50RWxlbWVudCkge1xuICAgICAgdGhpcy5wcm9wcy5jYW52YXMucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZCh0aGlzLnByb3BzLmNhbnZhcyk7XG4gICAgfVxuICB9XG5cbiAgX2FwcGVuZENhbnZhc0lmTmVlZGVkICgpIHtcbiAgICBpZiAoIWlzQnJvd3NlcigpKSByZXR1cm47XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MucGFyZW50ICE9PSBmYWxzZSAmJiAodGhpcy5wcm9wcy5jYW52YXMgJiYgIXRoaXMucHJvcHMuY2FudmFzLnBhcmVudEVsZW1lbnQpKSB7XG4gICAgICBjb25zdCBkZWZhdWx0UGFyZW50ID0gdGhpcy5zZXR0aW5ncy5wYXJlbnQgfHwgZG9jdW1lbnQuYm9keTtcbiAgICAgIGRlZmF1bHRQYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5wcm9wcy5jYW52YXMpO1xuICAgIH1cbiAgfVxuXG4gIF9zZXR1cEdMS2V5ICgpIHtcbiAgICBpZiAodGhpcy5wcm9wcy5jb250ZXh0KSB7XG4gICAgICBpZiAoaXNXZWJHTENvbnRleHQodGhpcy5wcm9wcy5jb250ZXh0KSkge1xuICAgICAgICB0aGlzLl9wcm9wcy5nbCA9IHRoaXMucHJvcHMuY29udGV4dDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9wcm9wcy5nbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXRUaW1lUHJvcHMgKHNldHRpbmdzID0ge30pIHtcbiAgICAvLyBHZXQgdGltaW5nIGRhdGFcbiAgICBsZXQgZHVyYXRpb24gPSBzZXR0aW5ncy5kdXJhdGlvbjtcbiAgICBsZXQgdG90YWxGcmFtZXMgPSBzZXR0aW5ncy50b3RhbEZyYW1lcztcbiAgICBjb25zdCB0aW1lU2NhbGUgPSBkZWZpbmVkKHNldHRpbmdzLnRpbWVTY2FsZSwgMSk7XG4gICAgY29uc3QgZnBzID0gZGVmaW5lZChzZXR0aW5ncy5mcHMsIDI0KTtcbiAgICBjb25zdCBoYXNEdXJhdGlvbiA9IHR5cGVvZiBkdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgaXNGaW5pdGUoZHVyYXRpb24pO1xuICAgIGNvbnN0IGhhc1RvdGFsRnJhbWVzID0gdHlwZW9mIHRvdGFsRnJhbWVzID09PSAnbnVtYmVyJyAmJiBpc0Zpbml0ZSh0b3RhbEZyYW1lcyk7XG5cbiAgICBjb25zdCB0b3RhbEZyYW1lc0Zyb21EdXJhdGlvbiA9IGhhc0R1cmF0aW9uID8gTWF0aC5mbG9vcihmcHMgKiBkdXJhdGlvbikgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgZHVyYXRpb25Gcm9tVG90YWxGcmFtZXMgPSBoYXNUb3RhbEZyYW1lcyA/ICh0b3RhbEZyYW1lcyAvIGZwcykgOiB1bmRlZmluZWQ7XG4gICAgaWYgKGhhc0R1cmF0aW9uICYmIGhhc1RvdGFsRnJhbWVzICYmIHRvdGFsRnJhbWVzRnJvbUR1cmF0aW9uICE9PSB0b3RhbEZyYW1lcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3Ugc2hvdWxkIHNwZWNpZnkgZWl0aGVyIGR1cmF0aW9uIG9yIHRvdGFsRnJhbWVzLCBidXQgbm90IGJvdGguIE9yLCB0aGV5IG11c3QgbWF0Y2ggZXhhY3RseS4nKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHNldHRpbmdzLmRpbWVuc2lvbnMgPT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBzZXR0aW5ncy51bml0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnNvbGUud2FybihgWW91J3ZlIHNwZWNpZmllZCBhIHsgdW5pdHMgfSBzZXR0aW5nIGJ1dCBubyB7IGRpbWVuc2lvbiB9LCBzbyB0aGUgdW5pdHMgd2lsbCBiZSBpZ25vcmVkLmApO1xuICAgIH1cblxuICAgIHRvdGFsRnJhbWVzID0gZGVmaW5lZCh0b3RhbEZyYW1lcywgdG90YWxGcmFtZXNGcm9tRHVyYXRpb24sIEluZmluaXR5KTtcbiAgICBkdXJhdGlvbiA9IGRlZmluZWQoZHVyYXRpb24sIGR1cmF0aW9uRnJvbVRvdGFsRnJhbWVzLCBJbmZpbml0eSk7XG5cbiAgICBjb25zdCBzdGFydFRpbWUgPSBzZXR0aW5ncy50aW1lO1xuICAgIGNvbnN0IHN0YXJ0RnJhbWUgPSBzZXR0aW5ncy5mcmFtZTtcbiAgICBjb25zdCBoYXNTdGFydFRpbWUgPSB0eXBlb2Ygc3RhcnRUaW1lID09PSAnbnVtYmVyJyAmJiBpc0Zpbml0ZShzdGFydFRpbWUpO1xuICAgIGNvbnN0IGhhc1N0YXJ0RnJhbWUgPSB0eXBlb2Ygc3RhcnRGcmFtZSA9PT0gJ251bWJlcicgJiYgaXNGaW5pdGUoc3RhcnRGcmFtZSk7XG5cbiAgICAvLyBzdGFydCBhdCB6ZXJvIHVubGVzcyB1c2VyIHNwZWNpZmllcyBmcmFtZSBvciB0aW1lIChidXQgbm90IGJvdGggbWlzbWF0Y2hlZClcbiAgICBsZXQgdGltZSA9IDA7XG4gICAgbGV0IGZyYW1lID0gMDtcbiAgICBsZXQgcGxheWhlYWQgPSAwO1xuICAgIGlmIChoYXNTdGFydFRpbWUgJiYgaGFzU3RhcnRGcmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3Ugc2hvdWxkIHNwZWNpZnkgZWl0aGVyIHN0YXJ0IGZyYW1lIG9yIHRpbWUsIGJ1dCBub3QgYm90aC4nKTtcbiAgICB9IGVsc2UgaWYgKGhhc1N0YXJ0VGltZSkge1xuICAgICAgLy8gVXNlciBzcGVjaWZpZXMgdGltZSwgd2UgaW5mZXIgZnJhbWVzIGZyb20gRlBTXG4gICAgICB0aW1lID0gc3RhcnRUaW1lO1xuICAgICAgcGxheWhlYWQgPSB0aGlzLl9jb21wdXRlUGxheWhlYWQodGltZSwgZHVyYXRpb24pO1xuICAgICAgZnJhbWUgPSB0aGlzLl9jb21wdXRlRnJhbWUoXG4gICAgICAgIHBsYXloZWFkLCB0aW1lLFxuICAgICAgICB0b3RhbEZyYW1lcywgZnBzXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAoaGFzU3RhcnRGcmFtZSkge1xuICAgICAgLy8gVXNlciBzcGVjaWZpZXMgZnJhbWUgbnVtYmVyLCB3ZSBpbmZlciB0aW1lIGZyb20gRlBTXG4gICAgICBmcmFtZSA9IHN0YXJ0RnJhbWU7XG4gICAgICB0aW1lID0gZnJhbWUgLyBmcHM7XG4gICAgICBwbGF5aGVhZCA9IHRoaXMuX2NvbXB1dGVQbGF5aGVhZCh0aW1lLCBkdXJhdGlvbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHBsYXloZWFkLFxuICAgICAgdGltZSxcbiAgICAgIGZyYW1lLFxuICAgICAgZHVyYXRpb24sXG4gICAgICB0b3RhbEZyYW1lcyxcbiAgICAgIGZwcyxcbiAgICAgIHRpbWVTY2FsZVxuICAgIH07XG4gIH1cblxuICBzZXR1cCAoc2V0dGluZ3MgPSB7fSkge1xuICAgIGlmICh0aGlzLnNrZXRjaCkgdGhyb3cgbmV3IEVycm9yKCdNdWx0aXBsZSBzZXR1cCgpIGNhbGxzIG5vdCB5ZXQgc3VwcG9ydGVkLicpO1xuXG4gICAgdGhpcy5fc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBzZXR0aW5ncywgdGhpcy5fc2V0dGluZ3MpO1xuXG4gICAgY2hlY2tTZXR0aW5ncyh0aGlzLl9zZXR0aW5ncyk7XG5cbiAgICAvLyBHZXQgaW5pdGlhbCBjYW52YXMgJiBjb250ZXh0XG4gICAgY29uc3QgeyBjb250ZXh0LCBjYW52YXMgfSA9IGNyZWF0ZUNhbnZhcyh0aGlzLl9zZXR0aW5ncyk7XG5cbiAgICBjb25zdCB0aW1lUHJvcHMgPSB0aGlzLmdldFRpbWVQcm9wcyh0aGlzLl9zZXR0aW5ncyk7XG5cbiAgICAvLyBJbml0aWFsIHJlbmRlciBzdGF0ZSBmZWF0dXJlc1xuICAgIHRoaXMuX3Byb3BzID0ge1xuICAgICAgLi4udGltZVByb3BzLFxuICAgICAgY2FudmFzLFxuICAgICAgY29udGV4dCxcbiAgICAgIGRlbHRhVGltZTogMCxcbiAgICAgIHN0YXJ0ZWQ6IGZhbHNlLFxuICAgICAgZXhwb3J0aW5nOiBmYWxzZSxcbiAgICAgIHBsYXlpbmc6IGZhbHNlLFxuICAgICAgcmVjb3JkaW5nOiBmYWxzZSxcbiAgICAgIHNldHRpbmdzOiB0aGlzLnNldHRpbmdzLFxuICAgICAgZGF0YTogdGhpcy5zZXR0aW5ncy5kYXRhLFxuXG4gICAgICAvLyBFeHBvcnQgc29tZSBzcGVjaWZpYyBhY3Rpb25zIHRvIHRoZSBza2V0Y2hcbiAgICAgIHJlbmRlcjogKCkgPT4gdGhpcy5yZW5kZXIoKSxcbiAgICAgIHRvZ2dsZVBsYXk6ICgpID0+IHRoaXMudG9nZ2xlUGxheSgpLFxuICAgICAgZGlzcGF0Y2g6IChjYikgPT4gdGhpcy5kaXNwYXRjaChjYiksXG4gICAgICB0aWNrOiAoKSA9PiB0aGlzLnRpY2soKSxcbiAgICAgIHJlc2l6ZTogKCkgPT4gdGhpcy5yZXNpemUoKSxcbiAgICAgIHVwZGF0ZTogKG9wdCkgPT4gdGhpcy51cGRhdGUob3B0KSxcbiAgICAgIGV4cG9ydEZyYW1lOiBvcHQgPT4gdGhpcy5leHBvcnRGcmFtZShvcHQpLFxuICAgICAgcmVjb3JkOiAoKSA9PiB0aGlzLnJlY29yZCgpLFxuICAgICAgcGxheTogKCkgPT4gdGhpcy5wbGF5KCksXG4gICAgICBwYXVzZTogKCkgPT4gdGhpcy5wYXVzZSgpLFxuICAgICAgc3RvcDogKCkgPT4gdGhpcy5zdG9wKClcbiAgICB9O1xuXG4gICAgLy8gRm9yIFdlYkdMIHNrZXRjaGVzLCBhIGdsIHZhcmlhYmxlIHJlYWRzIGEgYml0IGJldHRlclxuICAgIHRoaXMuX3NldHVwR0xLZXkoKTtcblxuICAgIC8vIFRyaWdnZXIgaW5pdGlhbCByZXNpemUgbm93IHNvIHRoYXQgY2FudmFzIGlzIGFscmVhZHkgc2l6ZWRcbiAgICAvLyBieSB0aGUgdGltZSB3ZSBsb2FkIHRoZSBza2V0Y2hcbiAgICB0aGlzLnJlc2l6ZSgpO1xuICB9XG5cbiAgbG9hZEFuZFJ1biAoY2FudmFzU2tldGNoLCBuZXdTZXR0aW5ncykge1xuICAgIHJldHVybiB0aGlzLmxvYWQoY2FudmFzU2tldGNoLCBuZXdTZXR0aW5ncykudGhlbigoKSA9PiB7XG4gICAgICB0aGlzLnJ1bigpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gIH1cblxuICB1bmxvYWQgKCkge1xuICAgIHRoaXMucGF1c2UoKTtcbiAgICBpZiAoIXRoaXMuc2tldGNoKSByZXR1cm47XG4gICAgaWYgKHR5cGVvZiB0aGlzLnNrZXRjaC51bmxvYWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuX3dyYXBDb250ZXh0U2NhbGUocHJvcHMgPT4gdGhpcy5za2V0Y2gudW5sb2FkKHByb3BzKSk7XG4gICAgfVxuICAgIHRoaXMuX3NrZXRjaCA9IG51bGw7XG4gIH1cblxuICBkZXN0cm95ICgpIHtcbiAgICB0aGlzLnVubG9hZCgpO1xuICAgIHRoaXMudW5tb3VudCgpO1xuICB9XG5cbiAgbG9hZCAoY3JlYXRlU2tldGNoLCBuZXdTZXR0aW5ncykge1xuICAgIC8vIFVzZXIgZGlkbid0IHNwZWNpZnkgYSBmdW5jdGlvblxuICAgIGlmICh0eXBlb2YgY3JlYXRlU2tldGNoICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBmdW5jdGlvbiBtdXN0IHRha2UgaW4gYSBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgcGFyYW1ldGVyLiBFeGFtcGxlOlxcbiAgY2FudmFzU2tldGNoZXIoKCkgPT4geyAuLi4gfSwgc2V0dGluZ3MpJyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2tldGNoKSB7XG4gICAgICB0aGlzLnVubG9hZCgpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgbmV3U2V0dGluZ3MgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aGlzLnVwZGF0ZShuZXdTZXR0aW5ncyk7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBhIGJpdCBvZiBhIHRyaWNreSBjYXNlOyB3ZSBzZXQgdXAgdGhlIGF1dG8tc2NhbGluZyBoZXJlXG4gICAgLy8gaW4gY2FzZSB0aGUgdXNlciBkZWNpZGVzIHRvIHJlbmRlciBhbnl0aGluZyB0byB0aGUgY29udGV4dCAqYmVmb3JlKiB0aGVcbiAgICAvLyByZW5kZXIoKSBmdW5jdGlvbi4uLiBIb3dldmVyLCB1c2VycyBzaG91bGQgaW5zdGVhZCB1c2UgYmVnaW4oKSBmdW5jdGlvbiBmb3IgdGhhdC5cbiAgICB0aGlzLl9wcmVSZW5kZXIoKTtcblxuICAgIGxldCBwcmVsb2FkID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgICAvLyBCZWNhdXNlIG9mIFA1LmpzJ3MgdW51c3VhbCBzdHJ1Y3R1cmUsIHdlIGhhdmUgdG8gZG8gYSBiaXQgb2ZcbiAgICAvLyBsaWJyYXJ5LXNwZWNpZmljIGNoYW5nZXMgdG8gc3VwcG9ydCBpdCBwcm9wZXJseS5cbiAgICBpZiAodGhpcy5zZXR0aW5ncy5wNSkge1xuICAgICAgaWYgKCFpc0Jyb3dzZXIoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1tjYW52YXMtc2tldGNoXSBFUlJPUjogVXNpbmcgcDUuanMgaW4gTm9kZS5qcyBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gICAgICB9XG4gICAgICBwcmVsb2FkID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgIGxldCBQNUNvbnN0cnVjdG9yID0gdGhpcy5zZXR0aW5ncy5wNTtcbiAgICAgICAgbGV0IHByZWxvYWQ7XG4gICAgICAgIGlmIChQNUNvbnN0cnVjdG9yLnA1KSB7XG4gICAgICAgICAgcHJlbG9hZCA9IFA1Q29uc3RydWN0b3IucHJlbG9hZDtcbiAgICAgICAgICBQNUNvbnN0cnVjdG9yID0gUDVDb25zdHJ1Y3Rvci5wNTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZSBza2V0Y2ggc2V0dXA7IGRpc2FibGUgbG9vcCwgc2V0IHNpemluZywgZXRjLlxuICAgICAgICBjb25zdCBwNVNrZXRjaCA9IHA1ID0+IHtcbiAgICAgICAgICAvLyBIb29rIGluIHByZWxvYWQgaWYgbmVjZXNzYXJ5XG4gICAgICAgICAgaWYgKHByZWxvYWQpIHA1LnByZWxvYWQgPSAoKSA9PiBwcmVsb2FkKHA1KTtcbiAgICAgICAgICBwNS5zZXR1cCA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BzID0gdGhpcy5wcm9wcztcbiAgICAgICAgICAgIGNvbnN0IGlzR0wgPSB0aGlzLnNldHRpbmdzLmNvbnRleHQgPT09ICd3ZWJnbCc7XG4gICAgICAgICAgICBjb25zdCByZW5kZXJlciA9IGlzR0wgPyBwNS5XRUJHTCA6IHA1LlAyRDtcbiAgICAgICAgICAgIHA1Lm5vTG9vcCgpO1xuICAgICAgICAgICAgcDUucGl4ZWxEZW5zaXR5KHByb3BzLnBpeGVsUmF0aW8pO1xuICAgICAgICAgICAgcDUuY3JlYXRlQ2FudmFzKHByb3BzLnZpZXdwb3J0V2lkdGgsIHByb3BzLnZpZXdwb3J0SGVpZ2h0LCByZW5kZXJlcik7XG4gICAgICAgICAgICBpZiAoaXNHTCAmJiB0aGlzLnNldHRpbmdzLmF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgICAgcDUuc2V0QXR0cmlidXRlcyh0aGlzLnNldHRpbmdzLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSh7IHA1LCBjYW52YXM6IHA1LmNhbnZhcywgY29udGV4dDogcDUuX3JlbmRlcmVyLmRyYXdpbmdDb250ZXh0IH0pO1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gU3VwcG9ydCBnbG9iYWwgYW5kIGluc3RhbmNlIFA1LmpzIG1vZGVzXG4gICAgICAgIGlmICh0eXBlb2YgUDVDb25zdHJ1Y3RvciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIG5ldyBQNUNvbnN0cnVjdG9yKHA1U2tldGNoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHdpbmRvdy5jcmVhdGVDYW52YXMgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInsgcDUgfSBzZXR0aW5nIGlzIHBhc3NlZCBidXQgY2FuJ3QgZmluZCBwNS5qcyBpbiBnbG9iYWwgKHdpbmRvdykgc2NvcGUuIE1heWJlIHlvdSBkaWQgbm90IGNyZWF0ZSBpdCBnbG9iYWxseT9cXG5uZXcgcDUoKTsgLy8gPC0tIGF0dGFjaGVzIHRvIGdsb2JhbCBzY29wZVwiKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcDVTa2V0Y2god2luZG93KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHByZWxvYWQudGhlbigoKSA9PiB7XG4gICAgICAvLyBMb2FkIHRoZSB1c2VyJ3Mgc2tldGNoXG4gICAgICBsZXQgbG9hZGVyID0gY3JlYXRlU2tldGNoKHRoaXMucHJvcHMpO1xuICAgICAgaWYgKCFpc1Byb21pc2UobG9hZGVyKSkge1xuICAgICAgICBsb2FkZXIgPSBQcm9taXNlLnJlc29sdmUobG9hZGVyKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsb2FkZXI7XG4gICAgfSkudGhlbihza2V0Y2ggPT4ge1xuICAgICAgaWYgKCFza2V0Y2gpIHNrZXRjaCA9IHt9O1xuICAgICAgdGhpcy5fc2tldGNoID0gc2tldGNoO1xuXG4gICAgICAvLyBPbmNlIHRoZSBza2V0Y2ggaXMgbG9hZGVkIHdlIGNhbiBhZGQgdGhlIGV2ZW50c1xuICAgICAgaWYgKGlzQnJvd3NlcigpKSB7XG4gICAgICAgIHRoaXMuX2tleWJvYXJkU2hvcnRjdXRzLmF0dGFjaCgpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5fcmVzaXplSGFuZGxlcik7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3Bvc3RSZW5kZXIoKTtcblxuICAgICAgLy8gVGhlIGluaXRpYWwgcmVzaXplKCkgaW4gdGhlIGNvbnN0cnVjdG9yIHdpbGwgbm90IGhhdmVcbiAgICAgIC8vIHRyaWdnZXJlZCBhIHJlc2l6ZSgpIGV2ZW50IG9uIHRoZSBza2V0Y2gsIHNpbmNlIGl0IHdhcyBiZWZvcmVcbiAgICAgIC8vIHRoZSBza2V0Y2ggd2FzIGxvYWRlZC4gU28gd2Ugc2VuZCB0aGUgc2lnbmFsIGhlcmUsIGFsbG93aW5nXG4gICAgICAvLyB1c2VycyB0byByZWFjdCB0byB0aGUgaW5pdGlhbCBzaXplIGJlZm9yZSBmaXJzdCByZW5kZXIuXG4gICAgICB0aGlzLl9zaXplQ2hhbmdlZCgpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgIGNvbnNvbGUud2FybignQ291bGQgbm90IHN0YXJ0IHNrZXRjaCwgdGhlIGFzeW5jIGxvYWRpbmcgZnVuY3Rpb24gcmVqZWN0ZWQgd2l0aCBhbiBlcnJvcjpcXG4gICAgRXJyb3I6ICcgKyBlcnIubWVzc2FnZSk7XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgU2tldGNoTWFuYWdlcjtcbiIsImltcG9ydCBTa2V0Y2hNYW5hZ2VyIGZyb20gJy4vY29yZS9Ta2V0Y2hNYW5hZ2VyJztcbmltcG9ydCBQYXBlclNpemVzIGZyb20gJy4vcGFwZXItc2l6ZXMnO1xuaW1wb3J0IHsgZ2V0Q2xpZW50QVBJLCBkZWZpbmVkIH0gZnJvbSAnLi91dGlsJztcblxuY29uc3QgQ0FDSEUgPSAnaG90LWlkLWNhY2hlJztcbmNvbnN0IHJ1bnRpbWVDb2xsaXNpb25zID0gW107XG5cbmZ1bmN0aW9uIGlzSG90UmVsb2FkICgpIHtcbiAgY29uc3QgY2xpZW50ID0gZ2V0Q2xpZW50QVBJKCk7XG4gIHJldHVybiBjbGllbnQgJiYgY2xpZW50LmhvdDtcbn1cblxuZnVuY3Rpb24gY2FjaGVHZXQgKGlkKSB7XG4gIGNvbnN0IGNsaWVudCA9IGdldENsaWVudEFQSSgpO1xuICBpZiAoIWNsaWVudCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY2xpZW50W0NBQ0hFXSA9IGNsaWVudFtDQUNIRV0gfHwge307XG4gIHJldHVybiBjbGllbnRbQ0FDSEVdW2lkXTtcbn1cblxuZnVuY3Rpb24gY2FjaGVQdXQgKGlkLCBkYXRhKSB7XG4gIGNvbnN0IGNsaWVudCA9IGdldENsaWVudEFQSSgpO1xuICBpZiAoIWNsaWVudCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY2xpZW50W0NBQ0hFXSA9IGNsaWVudFtDQUNIRV0gfHwge307XG4gIGNsaWVudFtDQUNIRV1baWRdID0gZGF0YTtcbn1cblxuZnVuY3Rpb24gZ2V0VGltZVByb3AgKG9sZE1hbmFnZXIsIG5ld1NldHRpbmdzKSB7XG4gIC8vIFN0YXRpYyBza2V0Y2hlcyBpZ25vcmUgdGhlIHRpbWUgcGVyc2lzdGVuY3lcbiAgcmV0dXJuIG5ld1NldHRpbmdzLmFuaW1hdGUgPyB7IHRpbWU6IG9sZE1hbmFnZXIucHJvcHMudGltZSB9IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjYW52YXNTa2V0Y2ggKHNrZXRjaCwgc2V0dGluZ3MgPSB7fSkge1xuICBpZiAoc2V0dGluZ3MucDUpIHtcbiAgICBpZiAoc2V0dGluZ3MuY2FudmFzIHx8IChzZXR0aW5ncy5jb250ZXh0ICYmIHR5cGVvZiBzZXR0aW5ncy5jb250ZXh0ICE9PSAnc3RyaW5nJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW4geyBwNSB9IG1vZGUsIHlvdSBjYW4ndCBwYXNzIHlvdXIgb3duIGNhbnZhcyBvciBjb250ZXh0LCB1bmxlc3MgdGhlIGNvbnRleHQgaXMgYSBcIndlYmdsXCIgb3IgXCIyZFwiIHN0cmluZ2ApO1xuICAgIH1cblxuICAgIC8vIERvIG5vdCBjcmVhdGUgYSBjYW52YXMgb24gc3RhcnR1cCwgc2luY2UgUDUuanMgZG9lcyB0aGF0IGZvciB1c1xuICAgIGNvbnN0IGNvbnRleHQgPSB0eXBlb2Ygc2V0dGluZ3MuY29udGV4dCA9PT0gJ3N0cmluZycgPyBzZXR0aW5ncy5jb250ZXh0IDogZmFsc2U7XG4gICAgc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBzZXR0aW5ncywgeyBjYW52YXM6IGZhbHNlLCBjb250ZXh0IH0pO1xuICB9XG5cbiAgY29uc3QgaXNIb3QgPSBpc0hvdFJlbG9hZCgpO1xuICBsZXQgaG90SUQ7XG4gIGlmIChpc0hvdCkge1xuICAgIC8vIFVzZSBhIG1hZ2ljIG5hbWUgYnkgZGVmYXVsdCwgZm9yY2UgdXNlciB0byBkZWZpbmUgZWFjaCBza2V0Y2ggaWYgdGhleVxuICAgIC8vIHJlcXVpcmUgbW9yZSB0aGFuIG9uZSBpbiBhbiBhcHBsaWNhdGlvbi4gT3BlbiB0byBvdGhlciBpZGVhcyBvbiBob3cgdG8gdGFja2xlXG4gICAgLy8gdGhpcyBhcyB3ZWxsLi4uXG4gICAgaG90SUQgPSBkZWZpbmVkKHNldHRpbmdzLmlkLCAnJF9fREVGQVVMVF9DQU5WQVNfU0tFVENIX0lEX18kJyk7XG4gIH1cbiAgbGV0IGlzSW5qZWN0aW5nID0gaXNIb3QgJiYgdHlwZW9mIGhvdElEID09PSAnc3RyaW5nJztcblxuICBpZiAoaXNJbmplY3RpbmcgJiYgcnVudGltZUNvbGxpc2lvbnMuaW5jbHVkZXMoaG90SUQpKSB7XG4gICAgY29uc29sZS53YXJuKGBXYXJuaW5nOiBZb3UgaGF2ZSBtdWx0aXBsZSBjYWxscyB0byBjYW52YXNTa2V0Y2goKSBpbiAtLWhvdCBtb2RlLiBZb3UgbXVzdCBwYXNzIHVuaXF1ZSB7IGlkIH0gc3RyaW5ncyBpbiBzZXR0aW5ncyB0byBlbmFibGUgaG90IHJlbG9hZCBhY3Jvc3MgbXVsdGlwbGUgc2tldGNoZXMuIGAsIGhvdElEKTtcbiAgICBpc0luamVjdGluZyA9IGZhbHNlO1xuICB9XG5cbiAgbGV0IHByZWxvYWQgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICBpZiAoaXNJbmplY3RpbmcpIHtcbiAgICAvLyBNYXJrIHRoaXMgYXMgYWxyZWFkeSBzcG90dGVkIGluIHRoaXMgcnVudGltZSBpbnN0YW5jZVxuICAgIHJ1bnRpbWVDb2xsaXNpb25zLnB1c2goaG90SUQpO1xuXG4gICAgY29uc3QgcHJldmlvdXNEYXRhID0gY2FjaGVHZXQoaG90SUQpO1xuICAgIGlmIChwcmV2aW91c0RhdGEpIHtcbiAgICAgIGNvbnN0IG5leHQgPSAoKSA9PiB7XG4gICAgICAgIC8vIEdyYWIgbmV3IHByb3BzIGZyb20gb2xkIHNrZXRjaCBpbnN0YW5jZVxuICAgICAgICBjb25zdCBuZXdQcm9wcyA9IGdldFRpbWVQcm9wKHByZXZpb3VzRGF0YS5tYW5hZ2VyLCBzZXR0aW5ncyk7XG4gICAgICAgIC8vIERlc3Ryb3kgdGhlIG9sZCBpbnN0YW5jZVxuICAgICAgICBwcmV2aW91c0RhdGEubWFuYWdlci5kZXN0cm95KCk7XG4gICAgICAgIC8vIFBhc3MgYWxvbmcgbmV3IHByb3BzXG4gICAgICAgIHJldHVybiBuZXdQcm9wcztcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vdmUgYWxvbmcgdGhlIG5leHQgZGF0YS4uLlxuICAgICAgcHJlbG9hZCA9IHByZXZpb3VzRGF0YS5sb2FkLnRoZW4obmV4dCkuY2F0Y2gobmV4dCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHByZWxvYWQudGhlbihuZXdQcm9wcyA9PiB7XG4gICAgY29uc3QgbWFuYWdlciA9IG5ldyBTa2V0Y2hNYW5hZ2VyKCk7XG4gICAgbGV0IHJlc3VsdDtcbiAgICBpZiAoc2tldGNoKSB7XG4gICAgICAvLyBNZXJnZSB3aXRoIGluY29taW5nIGRhdGFcbiAgICAgIHNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgc2V0dGluZ3MsIG5ld1Byb3BzKTtcblxuICAgICAgLy8gQXBwbHkgc2V0dGluZ3MgYW5kIGNyZWF0ZSBhIGNhbnZhc1xuICAgICAgbWFuYWdlci5zZXR1cChzZXR0aW5ncyk7XG5cbiAgICAgIC8vIE1vdW50IHRvIERPTVxuICAgICAgbWFuYWdlci5tb3VudCgpO1xuXG4gICAgICAvLyBsb2FkIHRoZSBza2V0Y2ggZmlyc3RcbiAgICAgIHJlc3VsdCA9IG1hbmFnZXIubG9hZEFuZFJ1bihza2V0Y2gpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQgPSBQcm9taXNlLnJlc29sdmUobWFuYWdlcik7XG4gICAgfVxuICAgIGlmIChpc0luamVjdGluZykge1xuICAgICAgY2FjaGVQdXQoaG90SUQsIHsgbG9hZDogcmVzdWx0LCBtYW5hZ2VyIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9KTtcbn1cblxuLy8gVE9ETzogRmlndXJlIG91dCBhIG5pY2Ugd2F5IHRvIGV4cG9ydCB0aGluZ3MuXG5jYW52YXNTa2V0Y2guY2FudmFzU2tldGNoID0gY2FudmFzU2tldGNoO1xuY2FudmFzU2tldGNoLlBhcGVyU2l6ZXMgPSBQYXBlclNpemVzO1xuXG5leHBvcnQgZGVmYXVsdCBjYW52YXNTa2V0Y2g7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYXJndW1lbnRzW2ldICE9PSB1bmRlZmluZWQpIHJldHVybiBhcmd1bWVudHNbaV07XG4gICAgfVxufTtcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbnZhciB3aWR0aCA9IDI1NjsvLyBlYWNoIFJDNCBvdXRwdXQgaXMgMCA8PSB4IDwgMjU2XHJcbnZhciBjaHVua3MgPSA2Oy8vIGF0IGxlYXN0IHNpeCBSQzQgb3V0cHV0cyBmb3IgZWFjaCBkb3VibGVcclxudmFyIGRpZ2l0cyA9IDUyOy8vIHRoZXJlIGFyZSA1MiBzaWduaWZpY2FudCBkaWdpdHMgaW4gYSBkb3VibGVcclxudmFyIHBvb2wgPSBbXTsvLyBwb29sOiBlbnRyb3B5IHBvb2wgc3RhcnRzIGVtcHR5XHJcbnZhciBHTE9CQUwgPSB0eXBlb2YgZ2xvYmFsID09PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IGdsb2JhbDtcclxuXHJcbi8vXHJcbi8vIFRoZSBmb2xsb3dpbmcgY29uc3RhbnRzIGFyZSByZWxhdGVkIHRvIElFRUUgNzU0IGxpbWl0cy5cclxuLy9cclxudmFyIHN0YXJ0ZGVub20gPSBNYXRoLnBvdyh3aWR0aCwgY2h1bmtzKSxcclxuICAgIHNpZ25pZmljYW5jZSA9IE1hdGgucG93KDIsIGRpZ2l0cyksXHJcbiAgICBvdmVyZmxvdyA9IHNpZ25pZmljYW5jZSAqIDIsXHJcbiAgICBtYXNrID0gd2lkdGggLSAxO1xyXG5cclxuXHJcbnZhciBvbGRSYW5kb20gPSBNYXRoLnJhbmRvbTtcclxuXHJcbi8vXHJcbi8vIHNlZWRyYW5kb20oKVxyXG4vLyBUaGlzIGlzIHRoZSBzZWVkcmFuZG9tIGZ1bmN0aW9uIGRlc2NyaWJlZCBhYm92ZS5cclxuLy9cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzZWVkLCBvcHRpb25zKSB7XHJcbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5nbG9iYWwgPT09IHRydWUpIHtcclxuICAgIG9wdGlvbnMuZ2xvYmFsID0gZmFsc2U7XHJcbiAgICBNYXRoLnJhbmRvbSA9IG1vZHVsZS5leHBvcnRzKHNlZWQsIG9wdGlvbnMpO1xyXG4gICAgb3B0aW9ucy5nbG9iYWwgPSB0cnVlO1xyXG4gICAgcmV0dXJuIE1hdGgucmFuZG9tO1xyXG4gIH1cclxuICB2YXIgdXNlX2VudHJvcHkgPSAob3B0aW9ucyAmJiBvcHRpb25zLmVudHJvcHkpIHx8IGZhbHNlO1xyXG4gIHZhciBrZXkgPSBbXTtcclxuXHJcbiAgLy8gRmxhdHRlbiB0aGUgc2VlZCBzdHJpbmcgb3IgYnVpbGQgb25lIGZyb20gbG9jYWwgZW50cm9weSBpZiBuZWVkZWQuXHJcbiAgdmFyIHNob3J0c2VlZCA9IG1peGtleShmbGF0dGVuKFxyXG4gICAgdXNlX2VudHJvcHkgPyBbc2VlZCwgdG9zdHJpbmcocG9vbCldIDpcclxuICAgIDAgaW4gYXJndW1lbnRzID8gc2VlZCA6IGF1dG9zZWVkKCksIDMpLCBrZXkpO1xyXG5cclxuICAvLyBVc2UgdGhlIHNlZWQgdG8gaW5pdGlhbGl6ZSBhbiBBUkM0IGdlbmVyYXRvci5cclxuICB2YXIgYXJjNCA9IG5ldyBBUkM0KGtleSk7XHJcblxyXG4gIC8vIE1peCB0aGUgcmFuZG9tbmVzcyBpbnRvIGFjY3VtdWxhdGVkIGVudHJvcHkuXHJcbiAgbWl4a2V5KHRvc3RyaW5nKGFyYzQuUyksIHBvb2wpO1xyXG5cclxuICAvLyBPdmVycmlkZSBNYXRoLnJhbmRvbVxyXG5cclxuICAvLyBUaGlzIGZ1bmN0aW9uIHJldHVybnMgYSByYW5kb20gZG91YmxlIGluIFswLCAxKSB0aGF0IGNvbnRhaW5zXHJcbiAgLy8gcmFuZG9tbmVzcyBpbiBldmVyeSBiaXQgb2YgdGhlIG1hbnRpc3NhIG9mIHRoZSBJRUVFIDc1NCB2YWx1ZS5cclxuXHJcbiAgcmV0dXJuIGZ1bmN0aW9uKCkgeyAgICAgICAgIC8vIENsb3N1cmUgdG8gcmV0dXJuIGEgcmFuZG9tIGRvdWJsZTpcclxuICAgIHZhciBuID0gYXJjNC5nKGNodW5rcyksICAgICAgICAgICAgIC8vIFN0YXJ0IHdpdGggYSBudW1lcmF0b3IgbiA8IDIgXiA0OFxyXG4gICAgICAgIGQgPSBzdGFydGRlbm9tLCAgICAgICAgICAgICAgICAgLy8gICBhbmQgZGVub21pbmF0b3IgZCA9IDIgXiA0OC5cclxuICAgICAgICB4ID0gMDsgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgYW5kIG5vICdleHRyYSBsYXN0IGJ5dGUnLlxyXG4gICAgd2hpbGUgKG4gPCBzaWduaWZpY2FuY2UpIHsgICAgICAgICAgLy8gRmlsbCB1cCBhbGwgc2lnbmlmaWNhbnQgZGlnaXRzIGJ5XHJcbiAgICAgIG4gPSAobiArIHgpICogd2lkdGg7ICAgICAgICAgICAgICAvLyAgIHNoaWZ0aW5nIG51bWVyYXRvciBhbmRcclxuICAgICAgZCAqPSB3aWR0aDsgICAgICAgICAgICAgICAgICAgICAgIC8vICAgZGVub21pbmF0b3IgYW5kIGdlbmVyYXRpbmcgYVxyXG4gICAgICB4ID0gYXJjNC5nKDEpOyAgICAgICAgICAgICAgICAgICAgLy8gICBuZXcgbGVhc3Qtc2lnbmlmaWNhbnQtYnl0ZS5cclxuICAgIH1cclxuICAgIHdoaWxlIChuID49IG92ZXJmbG93KSB7ICAgICAgICAgICAgIC8vIFRvIGF2b2lkIHJvdW5kaW5nIHVwLCBiZWZvcmUgYWRkaW5nXHJcbiAgICAgIG4gLz0gMjsgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGxhc3QgYnl0ZSwgc2hpZnQgZXZlcnl0aGluZ1xyXG4gICAgICBkIC89IDI7ICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICByaWdodCB1c2luZyBpbnRlZ2VyIE1hdGggdW50aWxcclxuICAgICAgeCA+Pj49IDE7ICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgd2UgaGF2ZSBleGFjdGx5IHRoZSBkZXNpcmVkIGJpdHMuXHJcbiAgICB9XHJcbiAgICByZXR1cm4gKG4gKyB4KSAvIGQ7ICAgICAgICAgICAgICAgICAvLyBGb3JtIHRoZSBudW1iZXIgd2l0aGluIFswLCAxKS5cclxuICB9O1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMucmVzZXRHbG9iYWwgPSBmdW5jdGlvbiAoKSB7XHJcbiAgTWF0aC5yYW5kb20gPSBvbGRSYW5kb207XHJcbn07XHJcblxyXG4vL1xyXG4vLyBBUkM0XHJcbi8vXHJcbi8vIEFuIEFSQzQgaW1wbGVtZW50YXRpb24uICBUaGUgY29uc3RydWN0b3IgdGFrZXMgYSBrZXkgaW4gdGhlIGZvcm0gb2ZcclxuLy8gYW4gYXJyYXkgb2YgYXQgbW9zdCAod2lkdGgpIGludGVnZXJzIHRoYXQgc2hvdWxkIGJlIDAgPD0geCA8ICh3aWR0aCkuXHJcbi8vXHJcbi8vIFRoZSBnKGNvdW50KSBtZXRob2QgcmV0dXJucyBhIHBzZXVkb3JhbmRvbSBpbnRlZ2VyIHRoYXQgY29uY2F0ZW5hdGVzXHJcbi8vIHRoZSBuZXh0IChjb3VudCkgb3V0cHV0cyBmcm9tIEFSQzQuICBJdHMgcmV0dXJuIHZhbHVlIGlzIGEgbnVtYmVyIHhcclxuLy8gdGhhdCBpcyBpbiB0aGUgcmFuZ2UgMCA8PSB4IDwgKHdpZHRoIF4gY291bnQpLlxyXG4vL1xyXG4vKiogQGNvbnN0cnVjdG9yICovXHJcbmZ1bmN0aW9uIEFSQzQoa2V5KSB7XHJcbiAgdmFyIHQsIGtleWxlbiA9IGtleS5sZW5ndGgsXHJcbiAgICAgIG1lID0gdGhpcywgaSA9IDAsIGogPSBtZS5pID0gbWUuaiA9IDAsIHMgPSBtZS5TID0gW107XHJcblxyXG4gIC8vIFRoZSBlbXB0eSBrZXkgW10gaXMgdHJlYXRlZCBhcyBbMF0uXHJcbiAgaWYgKCFrZXlsZW4pIHsga2V5ID0gW2tleWxlbisrXTsgfVxyXG5cclxuICAvLyBTZXQgdXAgUyB1c2luZyB0aGUgc3RhbmRhcmQga2V5IHNjaGVkdWxpbmcgYWxnb3JpdGhtLlxyXG4gIHdoaWxlIChpIDwgd2lkdGgpIHtcclxuICAgIHNbaV0gPSBpKys7XHJcbiAgfVxyXG4gIGZvciAoaSA9IDA7IGkgPCB3aWR0aDsgaSsrKSB7XHJcbiAgICBzW2ldID0gc1tqID0gbWFzayAmIChqICsga2V5W2kgJSBrZXlsZW5dICsgKHQgPSBzW2ldKSldO1xyXG4gICAgc1tqXSA9IHQ7XHJcbiAgfVxyXG5cclxuICAvLyBUaGUgXCJnXCIgbWV0aG9kIHJldHVybnMgdGhlIG5leHQgKGNvdW50KSBvdXRwdXRzIGFzIG9uZSBudW1iZXIuXHJcbiAgKG1lLmcgPSBmdW5jdGlvbihjb3VudCkge1xyXG4gICAgLy8gVXNpbmcgaW5zdGFuY2UgbWVtYmVycyBpbnN0ZWFkIG9mIGNsb3N1cmUgc3RhdGUgbmVhcmx5IGRvdWJsZXMgc3BlZWQuXHJcbiAgICB2YXIgdCwgciA9IDAsXHJcbiAgICAgICAgaSA9IG1lLmksIGogPSBtZS5qLCBzID0gbWUuUztcclxuICAgIHdoaWxlIChjb3VudC0tKSB7XHJcbiAgICAgIHQgPSBzW2kgPSBtYXNrICYgKGkgKyAxKV07XHJcbiAgICAgIHIgPSByICogd2lkdGggKyBzW21hc2sgJiAoKHNbaV0gPSBzW2ogPSBtYXNrICYgKGogKyB0KV0pICsgKHNbal0gPSB0KSldO1xyXG4gICAgfVxyXG4gICAgbWUuaSA9IGk7IG1lLmogPSBqO1xyXG4gICAgcmV0dXJuIHI7XHJcbiAgICAvLyBGb3Igcm9idXN0IHVucHJlZGljdGFiaWxpdHkgZGlzY2FyZCBhbiBpbml0aWFsIGJhdGNoIG9mIHZhbHVlcy5cclxuICAgIC8vIFNlZSBodHRwOi8vd3d3LnJzYS5jb20vcnNhbGFicy9ub2RlLmFzcD9pZD0yMDA5XHJcbiAgfSkod2lkdGgpO1xyXG59XHJcblxyXG4vL1xyXG4vLyBmbGF0dGVuKClcclxuLy8gQ29udmVydHMgYW4gb2JqZWN0IHRyZWUgdG8gbmVzdGVkIGFycmF5cyBvZiBzdHJpbmdzLlxyXG4vL1xyXG5mdW5jdGlvbiBmbGF0dGVuKG9iaiwgZGVwdGgpIHtcclxuICB2YXIgcmVzdWx0ID0gW10sIHR5cCA9ICh0eXBlb2Ygb2JqKVswXSwgcHJvcDtcclxuICBpZiAoZGVwdGggJiYgdHlwID09ICdvJykge1xyXG4gICAgZm9yIChwcm9wIGluIG9iaikge1xyXG4gICAgICB0cnkgeyByZXN1bHQucHVzaChmbGF0dGVuKG9ialtwcm9wXSwgZGVwdGggLSAxKSk7IH0gY2F0Y2ggKGUpIHt9XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiAocmVzdWx0Lmxlbmd0aCA/IHJlc3VsdCA6IHR5cCA9PSAncycgPyBvYmogOiBvYmogKyAnXFwwJyk7XHJcbn1cclxuXHJcbi8vXHJcbi8vIG1peGtleSgpXHJcbi8vIE1peGVzIGEgc3RyaW5nIHNlZWQgaW50byBhIGtleSB0aGF0IGlzIGFuIGFycmF5IG9mIGludGVnZXJzLCBhbmRcclxuLy8gcmV0dXJucyBhIHNob3J0ZW5lZCBzdHJpbmcgc2VlZCB0aGF0IGlzIGVxdWl2YWxlbnQgdG8gdGhlIHJlc3VsdCBrZXkuXHJcbi8vXHJcbmZ1bmN0aW9uIG1peGtleShzZWVkLCBrZXkpIHtcclxuICB2YXIgc3RyaW5nc2VlZCA9IHNlZWQgKyAnJywgc21lYXIsIGogPSAwO1xyXG4gIHdoaWxlIChqIDwgc3RyaW5nc2VlZC5sZW5ndGgpIHtcclxuICAgIGtleVttYXNrICYgal0gPVxyXG4gICAgICBtYXNrICYgKChzbWVhciBePSBrZXlbbWFzayAmIGpdICogMTkpICsgc3RyaW5nc2VlZC5jaGFyQ29kZUF0KGorKykpO1xyXG4gIH1cclxuICByZXR1cm4gdG9zdHJpbmcoa2V5KTtcclxufVxyXG5cclxuLy9cclxuLy8gYXV0b3NlZWQoKVxyXG4vLyBSZXR1cm5zIGFuIG9iamVjdCBmb3IgYXV0b3NlZWRpbmcsIHVzaW5nIHdpbmRvdy5jcnlwdG8gaWYgYXZhaWxhYmxlLlxyXG4vL1xyXG4vKiogQHBhcmFtIHtVaW50OEFycmF5PX0gc2VlZCAqL1xyXG5mdW5jdGlvbiBhdXRvc2VlZChzZWVkKSB7XHJcbiAgdHJ5IHtcclxuICAgIEdMT0JBTC5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKHNlZWQgPSBuZXcgVWludDhBcnJheSh3aWR0aCkpO1xyXG4gICAgcmV0dXJuIHRvc3RyaW5nKHNlZWQpO1xyXG4gIH0gY2F0Y2ggKGUpIHtcclxuICAgIHJldHVybiBbK25ldyBEYXRlLCBHTE9CQUwsIEdMT0JBTC5uYXZpZ2F0b3IgJiYgR0xPQkFMLm5hdmlnYXRvci5wbHVnaW5zLFxyXG4gICAgICAgICAgICBHTE9CQUwuc2NyZWVuLCB0b3N0cmluZyhwb29sKV07XHJcbiAgfVxyXG59XHJcblxyXG4vL1xyXG4vLyB0b3N0cmluZygpXHJcbi8vIENvbnZlcnRzIGFuIGFycmF5IG9mIGNoYXJjb2RlcyB0byBhIHN0cmluZ1xyXG4vL1xyXG5mdW5jdGlvbiB0b3N0cmluZyhhKSB7XHJcbiAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkoMCwgYSk7XHJcbn1cclxuXHJcbi8vXHJcbi8vIFdoZW4gc2VlZHJhbmRvbS5qcyBpcyBsb2FkZWQsIHdlIGltbWVkaWF0ZWx5IG1peCBhIGZldyBiaXRzXHJcbi8vIGZyb20gdGhlIGJ1aWx0LWluIFJORyBpbnRvIHRoZSBlbnRyb3B5IHBvb2wuICBCZWNhdXNlIHdlIGRvXHJcbi8vIG5vdCB3YW50IHRvIGludGVmZXJlIHdpdGggZGV0ZXJtaW5zdGljIFBSTkcgc3RhdGUgbGF0ZXIsXHJcbi8vIHNlZWRyYW5kb20gd2lsbCBub3QgY2FsbCBNYXRoLnJhbmRvbSBvbiBpdHMgb3duIGFnYWluIGFmdGVyXHJcbi8vIGluaXRpYWxpemF0aW9uLlxyXG4vL1xyXG5taXhrZXkoTWF0aC5yYW5kb20oKSwgcG9vbCk7XHJcbiIsIi8qXG4gKiBBIGZhc3QgamF2YXNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiBzaW1wbGV4IG5vaXNlIGJ5IEpvbmFzIFdhZ25lclxuXG5CYXNlZCBvbiBhIHNwZWVkLWltcHJvdmVkIHNpbXBsZXggbm9pc2UgYWxnb3JpdGhtIGZvciAyRCwgM0QgYW5kIDREIGluIEphdmEuXG5XaGljaCBpcyBiYXNlZCBvbiBleGFtcGxlIGNvZGUgYnkgU3RlZmFuIEd1c3RhdnNvbiAoc3RlZ3VAaXRuLmxpdS5zZSkuXG5XaXRoIE9wdGltaXNhdGlvbnMgYnkgUGV0ZXIgRWFzdG1hbiAocGVhc3RtYW5AZHJpenpsZS5zdGFuZm9yZC5lZHUpLlxuQmV0dGVyIHJhbmsgb3JkZXJpbmcgbWV0aG9kIGJ5IFN0ZWZhbiBHdXN0YXZzb24gaW4gMjAxMi5cblxuXG4gQ29weXJpZ2h0IChjKSAyMDE4IEpvbmFzIFdhZ25lclxuXG4gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cbiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG4gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gU09GVFdBUkUuXG4gKi9cbihmdW5jdGlvbigpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciBGMiA9IDAuNSAqIChNYXRoLnNxcnQoMy4wKSAtIDEuMCk7XG4gIHZhciBHMiA9ICgzLjAgLSBNYXRoLnNxcnQoMy4wKSkgLyA2LjA7XG4gIHZhciBGMyA9IDEuMCAvIDMuMDtcbiAgdmFyIEczID0gMS4wIC8gNi4wO1xuICB2YXIgRjQgPSAoTWF0aC5zcXJ0KDUuMCkgLSAxLjApIC8gNC4wO1xuICB2YXIgRzQgPSAoNS4wIC0gTWF0aC5zcXJ0KDUuMCkpIC8gMjAuMDtcblxuICBmdW5jdGlvbiBTaW1wbGV4Tm9pc2UocmFuZG9tT3JTZWVkKSB7XG4gICAgdmFyIHJhbmRvbTtcbiAgICBpZiAodHlwZW9mIHJhbmRvbU9yU2VlZCA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByYW5kb20gPSByYW5kb21PclNlZWQ7XG4gICAgfVxuICAgIGVsc2UgaWYgKHJhbmRvbU9yU2VlZCkge1xuICAgICAgcmFuZG9tID0gYWxlYShyYW5kb21PclNlZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByYW5kb20gPSBNYXRoLnJhbmRvbTtcbiAgICB9XG4gICAgdGhpcy5wID0gYnVpbGRQZXJtdXRhdGlvblRhYmxlKHJhbmRvbSk7XG4gICAgdGhpcy5wZXJtID0gbmV3IFVpbnQ4QXJyYXkoNTEyKTtcbiAgICB0aGlzLnBlcm1Nb2QxMiA9IG5ldyBVaW50OEFycmF5KDUxMik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA1MTI7IGkrKykge1xuICAgICAgdGhpcy5wZXJtW2ldID0gdGhpcy5wW2kgJiAyNTVdO1xuICAgICAgdGhpcy5wZXJtTW9kMTJbaV0gPSB0aGlzLnBlcm1baV0gJSAxMjtcbiAgICB9XG5cbiAgfVxuICBTaW1wbGV4Tm9pc2UucHJvdG90eXBlID0ge1xuICAgIGdyYWQzOiBuZXcgRmxvYXQzMkFycmF5KFsxLCAxLCAwLFxuICAgICAgLTEsIDEsIDAsXG4gICAgICAxLCAtMSwgMCxcblxuICAgICAgLTEsIC0xLCAwLFxuICAgICAgMSwgMCwgMSxcbiAgICAgIC0xLCAwLCAxLFxuXG4gICAgICAxLCAwLCAtMSxcbiAgICAgIC0xLCAwLCAtMSxcbiAgICAgIDAsIDEsIDEsXG5cbiAgICAgIDAsIC0xLCAxLFxuICAgICAgMCwgMSwgLTEsXG4gICAgICAwLCAtMSwgLTFdKSxcbiAgICBncmFkNDogbmV3IEZsb2F0MzJBcnJheShbMCwgMSwgMSwgMSwgMCwgMSwgMSwgLTEsIDAsIDEsIC0xLCAxLCAwLCAxLCAtMSwgLTEsXG4gICAgICAwLCAtMSwgMSwgMSwgMCwgLTEsIDEsIC0xLCAwLCAtMSwgLTEsIDEsIDAsIC0xLCAtMSwgLTEsXG4gICAgICAxLCAwLCAxLCAxLCAxLCAwLCAxLCAtMSwgMSwgMCwgLTEsIDEsIDEsIDAsIC0xLCAtMSxcbiAgICAgIC0xLCAwLCAxLCAxLCAtMSwgMCwgMSwgLTEsIC0xLCAwLCAtMSwgMSwgLTEsIDAsIC0xLCAtMSxcbiAgICAgIDEsIDEsIDAsIDEsIDEsIDEsIDAsIC0xLCAxLCAtMSwgMCwgMSwgMSwgLTEsIDAsIC0xLFxuICAgICAgLTEsIDEsIDAsIDEsIC0xLCAxLCAwLCAtMSwgLTEsIC0xLCAwLCAxLCAtMSwgLTEsIDAsIC0xLFxuICAgICAgMSwgMSwgMSwgMCwgMSwgMSwgLTEsIDAsIDEsIC0xLCAxLCAwLCAxLCAtMSwgLTEsIDAsXG4gICAgICAtMSwgMSwgMSwgMCwgLTEsIDEsIC0xLCAwLCAtMSwgLTEsIDEsIDAsIC0xLCAtMSwgLTEsIDBdKSxcbiAgICBub2lzZTJEOiBmdW5jdGlvbih4aW4sIHlpbikge1xuICAgICAgdmFyIHBlcm1Nb2QxMiA9IHRoaXMucGVybU1vZDEyO1xuICAgICAgdmFyIHBlcm0gPSB0aGlzLnBlcm07XG4gICAgICB2YXIgZ3JhZDMgPSB0aGlzLmdyYWQzO1xuICAgICAgdmFyIG4wID0gMDsgLy8gTm9pc2UgY29udHJpYnV0aW9ucyBmcm9tIHRoZSB0aHJlZSBjb3JuZXJzXG4gICAgICB2YXIgbjEgPSAwO1xuICAgICAgdmFyIG4yID0gMDtcbiAgICAgIC8vIFNrZXcgdGhlIGlucHV0IHNwYWNlIHRvIGRldGVybWluZSB3aGljaCBzaW1wbGV4IGNlbGwgd2UncmUgaW5cbiAgICAgIHZhciBzID0gKHhpbiArIHlpbikgKiBGMjsgLy8gSGFpcnkgZmFjdG9yIGZvciAyRFxuICAgICAgdmFyIGkgPSBNYXRoLmZsb29yKHhpbiArIHMpO1xuICAgICAgdmFyIGogPSBNYXRoLmZsb29yKHlpbiArIHMpO1xuICAgICAgdmFyIHQgPSAoaSArIGopICogRzI7XG4gICAgICB2YXIgWDAgPSBpIC0gdDsgLy8gVW5za2V3IHRoZSBjZWxsIG9yaWdpbiBiYWNrIHRvICh4LHkpIHNwYWNlXG4gICAgICB2YXIgWTAgPSBqIC0gdDtcbiAgICAgIHZhciB4MCA9IHhpbiAtIFgwOyAvLyBUaGUgeCx5IGRpc3RhbmNlcyBmcm9tIHRoZSBjZWxsIG9yaWdpblxuICAgICAgdmFyIHkwID0geWluIC0gWTA7XG4gICAgICAvLyBGb3IgdGhlIDJEIGNhc2UsIHRoZSBzaW1wbGV4IHNoYXBlIGlzIGFuIGVxdWlsYXRlcmFsIHRyaWFuZ2xlLlxuICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIHNpbXBsZXggd2UgYXJlIGluLlxuICAgICAgdmFyIGkxLCBqMTsgLy8gT2Zmc2V0cyBmb3Igc2Vjb25kIChtaWRkbGUpIGNvcm5lciBvZiBzaW1wbGV4IGluIChpLGopIGNvb3Jkc1xuICAgICAgaWYgKHgwID4geTApIHtcbiAgICAgICAgaTEgPSAxO1xuICAgICAgICBqMSA9IDA7XG4gICAgICB9IC8vIGxvd2VyIHRyaWFuZ2xlLCBYWSBvcmRlcjogKDAsMCktPigxLDApLT4oMSwxKVxuICAgICAgZWxzZSB7XG4gICAgICAgIGkxID0gMDtcbiAgICAgICAgajEgPSAxO1xuICAgICAgfSAvLyB1cHBlciB0cmlhbmdsZSwgWVggb3JkZXI6ICgwLDApLT4oMCwxKS0+KDEsMSlcbiAgICAgIC8vIEEgc3RlcCBvZiAoMSwwKSBpbiAoaSxqKSBtZWFucyBhIHN0ZXAgb2YgKDEtYywtYykgaW4gKHgseSksIGFuZFxuICAgICAgLy8gYSBzdGVwIG9mICgwLDEpIGluIChpLGopIG1lYW5zIGEgc3RlcCBvZiAoLWMsMS1jKSBpbiAoeCx5KSwgd2hlcmVcbiAgICAgIC8vIGMgPSAoMy1zcXJ0KDMpKS82XG4gICAgICB2YXIgeDEgPSB4MCAtIGkxICsgRzI7IC8vIE9mZnNldHMgZm9yIG1pZGRsZSBjb3JuZXIgaW4gKHgseSkgdW5za2V3ZWQgY29vcmRzXG4gICAgICB2YXIgeTEgPSB5MCAtIGoxICsgRzI7XG4gICAgICB2YXIgeDIgPSB4MCAtIDEuMCArIDIuMCAqIEcyOyAvLyBPZmZzZXRzIGZvciBsYXN0IGNvcm5lciBpbiAoeCx5KSB1bnNrZXdlZCBjb29yZHNcbiAgICAgIHZhciB5MiA9IHkwIC0gMS4wICsgMi4wICogRzI7XG4gICAgICAvLyBXb3JrIG91dCB0aGUgaGFzaGVkIGdyYWRpZW50IGluZGljZXMgb2YgdGhlIHRocmVlIHNpbXBsZXggY29ybmVyc1xuICAgICAgdmFyIGlpID0gaSAmIDI1NTtcbiAgICAgIHZhciBqaiA9IGogJiAyNTU7XG4gICAgICAvLyBDYWxjdWxhdGUgdGhlIGNvbnRyaWJ1dGlvbiBmcm9tIHRoZSB0aHJlZSBjb3JuZXJzXG4gICAgICB2YXIgdDAgPSAwLjUgLSB4MCAqIHgwIC0geTAgKiB5MDtcbiAgICAgIGlmICh0MCA+PSAwKSB7XG4gICAgICAgIHZhciBnaTAgPSBwZXJtTW9kMTJbaWkgKyBwZXJtW2pqXV0gKiAzO1xuICAgICAgICB0MCAqPSB0MDtcbiAgICAgICAgbjAgPSB0MCAqIHQwICogKGdyYWQzW2dpMF0gKiB4MCArIGdyYWQzW2dpMCArIDFdICogeTApOyAvLyAoeCx5KSBvZiBncmFkMyB1c2VkIGZvciAyRCBncmFkaWVudFxuICAgICAgfVxuICAgICAgdmFyIHQxID0gMC41IC0geDEgKiB4MSAtIHkxICogeTE7XG4gICAgICBpZiAodDEgPj0gMCkge1xuICAgICAgICB2YXIgZ2kxID0gcGVybU1vZDEyW2lpICsgaTEgKyBwZXJtW2pqICsgajFdXSAqIDM7XG4gICAgICAgIHQxICo9IHQxO1xuICAgICAgICBuMSA9IHQxICogdDEgKiAoZ3JhZDNbZ2kxXSAqIHgxICsgZ3JhZDNbZ2kxICsgMV0gKiB5MSk7XG4gICAgICB9XG4gICAgICB2YXIgdDIgPSAwLjUgLSB4MiAqIHgyIC0geTIgKiB5MjtcbiAgICAgIGlmICh0MiA+PSAwKSB7XG4gICAgICAgIHZhciBnaTIgPSBwZXJtTW9kMTJbaWkgKyAxICsgcGVybVtqaiArIDFdXSAqIDM7XG4gICAgICAgIHQyICo9IHQyO1xuICAgICAgICBuMiA9IHQyICogdDIgKiAoZ3JhZDNbZ2kyXSAqIHgyICsgZ3JhZDNbZ2kyICsgMV0gKiB5Mik7XG4gICAgICB9XG4gICAgICAvLyBBZGQgY29udHJpYnV0aW9ucyBmcm9tIGVhY2ggY29ybmVyIHRvIGdldCB0aGUgZmluYWwgbm9pc2UgdmFsdWUuXG4gICAgICAvLyBUaGUgcmVzdWx0IGlzIHNjYWxlZCB0byByZXR1cm4gdmFsdWVzIGluIHRoZSBpbnRlcnZhbCBbLTEsMV0uXG4gICAgICByZXR1cm4gNzAuMCAqIChuMCArIG4xICsgbjIpO1xuICAgIH0sXG4gICAgLy8gM0Qgc2ltcGxleCBub2lzZVxuICAgIG5vaXNlM0Q6IGZ1bmN0aW9uKHhpbiwgeWluLCB6aW4pIHtcbiAgICAgIHZhciBwZXJtTW9kMTIgPSB0aGlzLnBlcm1Nb2QxMjtcbiAgICAgIHZhciBwZXJtID0gdGhpcy5wZXJtO1xuICAgICAgdmFyIGdyYWQzID0gdGhpcy5ncmFkMztcbiAgICAgIHZhciBuMCwgbjEsIG4yLCBuMzsgLy8gTm9pc2UgY29udHJpYnV0aW9ucyBmcm9tIHRoZSBmb3VyIGNvcm5lcnNcbiAgICAgIC8vIFNrZXcgdGhlIGlucHV0IHNwYWNlIHRvIGRldGVybWluZSB3aGljaCBzaW1wbGV4IGNlbGwgd2UncmUgaW5cbiAgICAgIHZhciBzID0gKHhpbiArIHlpbiArIHppbikgKiBGMzsgLy8gVmVyeSBuaWNlIGFuZCBzaW1wbGUgc2tldyBmYWN0b3IgZm9yIDNEXG4gICAgICB2YXIgaSA9IE1hdGguZmxvb3IoeGluICsgcyk7XG4gICAgICB2YXIgaiA9IE1hdGguZmxvb3IoeWluICsgcyk7XG4gICAgICB2YXIgayA9IE1hdGguZmxvb3IoemluICsgcyk7XG4gICAgICB2YXIgdCA9IChpICsgaiArIGspICogRzM7XG4gICAgICB2YXIgWDAgPSBpIC0gdDsgLy8gVW5za2V3IHRoZSBjZWxsIG9yaWdpbiBiYWNrIHRvICh4LHkseikgc3BhY2VcbiAgICAgIHZhciBZMCA9IGogLSB0O1xuICAgICAgdmFyIFowID0gayAtIHQ7XG4gICAgICB2YXIgeDAgPSB4aW4gLSBYMDsgLy8gVGhlIHgseSx6IGRpc3RhbmNlcyBmcm9tIHRoZSBjZWxsIG9yaWdpblxuICAgICAgdmFyIHkwID0geWluIC0gWTA7XG4gICAgICB2YXIgejAgPSB6aW4gLSBaMDtcbiAgICAgIC8vIEZvciB0aGUgM0QgY2FzZSwgdGhlIHNpbXBsZXggc2hhcGUgaXMgYSBzbGlnaHRseSBpcnJlZ3VsYXIgdGV0cmFoZWRyb24uXG4gICAgICAvLyBEZXRlcm1pbmUgd2hpY2ggc2ltcGxleCB3ZSBhcmUgaW4uXG4gICAgICB2YXIgaTEsIGoxLCBrMTsgLy8gT2Zmc2V0cyBmb3Igc2Vjb25kIGNvcm5lciBvZiBzaW1wbGV4IGluIChpLGosaykgY29vcmRzXG4gICAgICB2YXIgaTIsIGoyLCBrMjsgLy8gT2Zmc2V0cyBmb3IgdGhpcmQgY29ybmVyIG9mIHNpbXBsZXggaW4gKGksaixrKSBjb29yZHNcbiAgICAgIGlmICh4MCA+PSB5MCkge1xuICAgICAgICBpZiAoeTAgPj0gejApIHtcbiAgICAgICAgICBpMSA9IDE7XG4gICAgICAgICAgajEgPSAwO1xuICAgICAgICAgIGsxID0gMDtcbiAgICAgICAgICBpMiA9IDE7XG4gICAgICAgICAgajIgPSAxO1xuICAgICAgICAgIGsyID0gMDtcbiAgICAgICAgfSAvLyBYIFkgWiBvcmRlclxuICAgICAgICBlbHNlIGlmICh4MCA+PSB6MCkge1xuICAgICAgICAgIGkxID0gMTtcbiAgICAgICAgICBqMSA9IDA7XG4gICAgICAgICAgazEgPSAwO1xuICAgICAgICAgIGkyID0gMTtcbiAgICAgICAgICBqMiA9IDA7XG4gICAgICAgICAgazIgPSAxO1xuICAgICAgICB9IC8vIFggWiBZIG9yZGVyXG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGkxID0gMDtcbiAgICAgICAgICBqMSA9IDA7XG4gICAgICAgICAgazEgPSAxO1xuICAgICAgICAgIGkyID0gMTtcbiAgICAgICAgICBqMiA9IDA7XG4gICAgICAgICAgazIgPSAxO1xuICAgICAgICB9IC8vIFogWCBZIG9yZGVyXG4gICAgICB9XG4gICAgICBlbHNlIHsgLy8geDA8eTBcbiAgICAgICAgaWYgKHkwIDwgejApIHtcbiAgICAgICAgICBpMSA9IDA7XG4gICAgICAgICAgajEgPSAwO1xuICAgICAgICAgIGsxID0gMTtcbiAgICAgICAgICBpMiA9IDA7XG4gICAgICAgICAgajIgPSAxO1xuICAgICAgICAgIGsyID0gMTtcbiAgICAgICAgfSAvLyBaIFkgWCBvcmRlclxuICAgICAgICBlbHNlIGlmICh4MCA8IHowKSB7XG4gICAgICAgICAgaTEgPSAwO1xuICAgICAgICAgIGoxID0gMTtcbiAgICAgICAgICBrMSA9IDA7XG4gICAgICAgICAgaTIgPSAwO1xuICAgICAgICAgIGoyID0gMTtcbiAgICAgICAgICBrMiA9IDE7XG4gICAgICAgIH0gLy8gWSBaIFggb3JkZXJcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgaTEgPSAwO1xuICAgICAgICAgIGoxID0gMTtcbiAgICAgICAgICBrMSA9IDA7XG4gICAgICAgICAgaTIgPSAxO1xuICAgICAgICAgIGoyID0gMTtcbiAgICAgICAgICBrMiA9IDA7XG4gICAgICAgIH0gLy8gWSBYIFogb3JkZXJcbiAgICAgIH1cbiAgICAgIC8vIEEgc3RlcCBvZiAoMSwwLDApIGluIChpLGosaykgbWVhbnMgYSBzdGVwIG9mICgxLWMsLWMsLWMpIGluICh4LHkseiksXG4gICAgICAvLyBhIHN0ZXAgb2YgKDAsMSwwKSBpbiAoaSxqLGspIG1lYW5zIGEgc3RlcCBvZiAoLWMsMS1jLC1jKSBpbiAoeCx5LHopLCBhbmRcbiAgICAgIC8vIGEgc3RlcCBvZiAoMCwwLDEpIGluIChpLGosaykgbWVhbnMgYSBzdGVwIG9mICgtYywtYywxLWMpIGluICh4LHkseiksIHdoZXJlXG4gICAgICAvLyBjID0gMS82LlxuICAgICAgdmFyIHgxID0geDAgLSBpMSArIEczOyAvLyBPZmZzZXRzIGZvciBzZWNvbmQgY29ybmVyIGluICh4LHkseikgY29vcmRzXG4gICAgICB2YXIgeTEgPSB5MCAtIGoxICsgRzM7XG4gICAgICB2YXIgejEgPSB6MCAtIGsxICsgRzM7XG4gICAgICB2YXIgeDIgPSB4MCAtIGkyICsgMi4wICogRzM7IC8vIE9mZnNldHMgZm9yIHRoaXJkIGNvcm5lciBpbiAoeCx5LHopIGNvb3Jkc1xuICAgICAgdmFyIHkyID0geTAgLSBqMiArIDIuMCAqIEczO1xuICAgICAgdmFyIHoyID0gejAgLSBrMiArIDIuMCAqIEczO1xuICAgICAgdmFyIHgzID0geDAgLSAxLjAgKyAzLjAgKiBHMzsgLy8gT2Zmc2V0cyBmb3IgbGFzdCBjb3JuZXIgaW4gKHgseSx6KSBjb29yZHNcbiAgICAgIHZhciB5MyA9IHkwIC0gMS4wICsgMy4wICogRzM7XG4gICAgICB2YXIgejMgPSB6MCAtIDEuMCArIDMuMCAqIEczO1xuICAgICAgLy8gV29yayBvdXQgdGhlIGhhc2hlZCBncmFkaWVudCBpbmRpY2VzIG9mIHRoZSBmb3VyIHNpbXBsZXggY29ybmVyc1xuICAgICAgdmFyIGlpID0gaSAmIDI1NTtcbiAgICAgIHZhciBqaiA9IGogJiAyNTU7XG4gICAgICB2YXIga2sgPSBrICYgMjU1O1xuICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBjb250cmlidXRpb24gZnJvbSB0aGUgZm91ciBjb3JuZXJzXG4gICAgICB2YXIgdDAgPSAwLjYgLSB4MCAqIHgwIC0geTAgKiB5MCAtIHowICogejA7XG4gICAgICBpZiAodDAgPCAwKSBuMCA9IDAuMDtcbiAgICAgIGVsc2Uge1xuICAgICAgICB2YXIgZ2kwID0gcGVybU1vZDEyW2lpICsgcGVybVtqaiArIHBlcm1ba2tdXV0gKiAzO1xuICAgICAgICB0MCAqPSB0MDtcbiAgICAgICAgbjAgPSB0MCAqIHQwICogKGdyYWQzW2dpMF0gKiB4MCArIGdyYWQzW2dpMCArIDFdICogeTAgKyBncmFkM1tnaTAgKyAyXSAqIHowKTtcbiAgICAgIH1cbiAgICAgIHZhciB0MSA9IDAuNiAtIHgxICogeDEgLSB5MSAqIHkxIC0gejEgKiB6MTtcbiAgICAgIGlmICh0MSA8IDApIG4xID0gMC4wO1xuICAgICAgZWxzZSB7XG4gICAgICAgIHZhciBnaTEgPSBwZXJtTW9kMTJbaWkgKyBpMSArIHBlcm1bamogKyBqMSArIHBlcm1ba2sgKyBrMV1dXSAqIDM7XG4gICAgICAgIHQxICo9IHQxO1xuICAgICAgICBuMSA9IHQxICogdDEgKiAoZ3JhZDNbZ2kxXSAqIHgxICsgZ3JhZDNbZ2kxICsgMV0gKiB5MSArIGdyYWQzW2dpMSArIDJdICogejEpO1xuICAgICAgfVxuICAgICAgdmFyIHQyID0gMC42IC0geDIgKiB4MiAtIHkyICogeTIgLSB6MiAqIHoyO1xuICAgICAgaWYgKHQyIDwgMCkgbjIgPSAwLjA7XG4gICAgICBlbHNlIHtcbiAgICAgICAgdmFyIGdpMiA9IHBlcm1Nb2QxMltpaSArIGkyICsgcGVybVtqaiArIGoyICsgcGVybVtrayArIGsyXV1dICogMztcbiAgICAgICAgdDIgKj0gdDI7XG4gICAgICAgIG4yID0gdDIgKiB0MiAqIChncmFkM1tnaTJdICogeDIgKyBncmFkM1tnaTIgKyAxXSAqIHkyICsgZ3JhZDNbZ2kyICsgMl0gKiB6Mik7XG4gICAgICB9XG4gICAgICB2YXIgdDMgPSAwLjYgLSB4MyAqIHgzIC0geTMgKiB5MyAtIHozICogejM7XG4gICAgICBpZiAodDMgPCAwKSBuMyA9IDAuMDtcbiAgICAgIGVsc2Uge1xuICAgICAgICB2YXIgZ2kzID0gcGVybU1vZDEyW2lpICsgMSArIHBlcm1bamogKyAxICsgcGVybVtrayArIDFdXV0gKiAzO1xuICAgICAgICB0MyAqPSB0MztcbiAgICAgICAgbjMgPSB0MyAqIHQzICogKGdyYWQzW2dpM10gKiB4MyArIGdyYWQzW2dpMyArIDFdICogeTMgKyBncmFkM1tnaTMgKyAyXSAqIHozKTtcbiAgICAgIH1cbiAgICAgIC8vIEFkZCBjb250cmlidXRpb25zIGZyb20gZWFjaCBjb3JuZXIgdG8gZ2V0IHRoZSBmaW5hbCBub2lzZSB2YWx1ZS5cbiAgICAgIC8vIFRoZSByZXN1bHQgaXMgc2NhbGVkIHRvIHN0YXkganVzdCBpbnNpZGUgWy0xLDFdXG4gICAgICByZXR1cm4gMzIuMCAqIChuMCArIG4xICsgbjIgKyBuMyk7XG4gICAgfSxcbiAgICAvLyA0RCBzaW1wbGV4IG5vaXNlLCBiZXR0ZXIgc2ltcGxleCByYW5rIG9yZGVyaW5nIG1ldGhvZCAyMDEyLTAzLTA5XG4gICAgbm9pc2U0RDogZnVuY3Rpb24oeCwgeSwgeiwgdykge1xuICAgICAgdmFyIHBlcm0gPSB0aGlzLnBlcm07XG4gICAgICB2YXIgZ3JhZDQgPSB0aGlzLmdyYWQ0O1xuXG4gICAgICB2YXIgbjAsIG4xLCBuMiwgbjMsIG40OyAvLyBOb2lzZSBjb250cmlidXRpb25zIGZyb20gdGhlIGZpdmUgY29ybmVyc1xuICAgICAgLy8gU2tldyB0aGUgKHgseSx6LHcpIHNwYWNlIHRvIGRldGVybWluZSB3aGljaCBjZWxsIG9mIDI0IHNpbXBsaWNlcyB3ZSdyZSBpblxuICAgICAgdmFyIHMgPSAoeCArIHkgKyB6ICsgdykgKiBGNDsgLy8gRmFjdG9yIGZvciA0RCBza2V3aW5nXG4gICAgICB2YXIgaSA9IE1hdGguZmxvb3IoeCArIHMpO1xuICAgICAgdmFyIGogPSBNYXRoLmZsb29yKHkgKyBzKTtcbiAgICAgIHZhciBrID0gTWF0aC5mbG9vcih6ICsgcyk7XG4gICAgICB2YXIgbCA9IE1hdGguZmxvb3IodyArIHMpO1xuICAgICAgdmFyIHQgPSAoaSArIGogKyBrICsgbCkgKiBHNDsgLy8gRmFjdG9yIGZvciA0RCB1bnNrZXdpbmdcbiAgICAgIHZhciBYMCA9IGkgLSB0OyAvLyBVbnNrZXcgdGhlIGNlbGwgb3JpZ2luIGJhY2sgdG8gKHgseSx6LHcpIHNwYWNlXG4gICAgICB2YXIgWTAgPSBqIC0gdDtcbiAgICAgIHZhciBaMCA9IGsgLSB0O1xuICAgICAgdmFyIFcwID0gbCAtIHQ7XG4gICAgICB2YXIgeDAgPSB4IC0gWDA7IC8vIFRoZSB4LHkseix3IGRpc3RhbmNlcyBmcm9tIHRoZSBjZWxsIG9yaWdpblxuICAgICAgdmFyIHkwID0geSAtIFkwO1xuICAgICAgdmFyIHowID0geiAtIFowO1xuICAgICAgdmFyIHcwID0gdyAtIFcwO1xuICAgICAgLy8gRm9yIHRoZSA0RCBjYXNlLCB0aGUgc2ltcGxleCBpcyBhIDREIHNoYXBlIEkgd29uJ3QgZXZlbiB0cnkgdG8gZGVzY3JpYmUuXG4gICAgICAvLyBUbyBmaW5kIG91dCB3aGljaCBvZiB0aGUgMjQgcG9zc2libGUgc2ltcGxpY2VzIHdlJ3JlIGluLCB3ZSBuZWVkIHRvXG4gICAgICAvLyBkZXRlcm1pbmUgdGhlIG1hZ25pdHVkZSBvcmRlcmluZyBvZiB4MCwgeTAsIHowIGFuZCB3MC5cbiAgICAgIC8vIFNpeCBwYWlyLXdpc2UgY29tcGFyaXNvbnMgYXJlIHBlcmZvcm1lZCBiZXR3ZWVuIGVhY2ggcG9zc2libGUgcGFpclxuICAgICAgLy8gb2YgdGhlIGZvdXIgY29vcmRpbmF0ZXMsIGFuZCB0aGUgcmVzdWx0cyBhcmUgdXNlZCB0byByYW5rIHRoZSBudW1iZXJzLlxuICAgICAgdmFyIHJhbmt4ID0gMDtcbiAgICAgIHZhciByYW5reSA9IDA7XG4gICAgICB2YXIgcmFua3ogPSAwO1xuICAgICAgdmFyIHJhbmt3ID0gMDtcbiAgICAgIGlmICh4MCA+IHkwKSByYW5reCsrO1xuICAgICAgZWxzZSByYW5reSsrO1xuICAgICAgaWYgKHgwID4gejApIHJhbmt4Kys7XG4gICAgICBlbHNlIHJhbmt6Kys7XG4gICAgICBpZiAoeDAgPiB3MCkgcmFua3grKztcbiAgICAgIGVsc2UgcmFua3crKztcbiAgICAgIGlmICh5MCA+IHowKSByYW5reSsrO1xuICAgICAgZWxzZSByYW5reisrO1xuICAgICAgaWYgKHkwID4gdzApIHJhbmt5Kys7XG4gICAgICBlbHNlIHJhbmt3Kys7XG4gICAgICBpZiAoejAgPiB3MCkgcmFua3orKztcbiAgICAgIGVsc2UgcmFua3crKztcbiAgICAgIHZhciBpMSwgajEsIGsxLCBsMTsgLy8gVGhlIGludGVnZXIgb2Zmc2V0cyBmb3IgdGhlIHNlY29uZCBzaW1wbGV4IGNvcm5lclxuICAgICAgdmFyIGkyLCBqMiwgazIsIGwyOyAvLyBUaGUgaW50ZWdlciBvZmZzZXRzIGZvciB0aGUgdGhpcmQgc2ltcGxleCBjb3JuZXJcbiAgICAgIHZhciBpMywgajMsIGszLCBsMzsgLy8gVGhlIGludGVnZXIgb2Zmc2V0cyBmb3IgdGhlIGZvdXJ0aCBzaW1wbGV4IGNvcm5lclxuICAgICAgLy8gc2ltcGxleFtjXSBpcyBhIDQtdmVjdG9yIHdpdGggdGhlIG51bWJlcnMgMCwgMSwgMiBhbmQgMyBpbiBzb21lIG9yZGVyLlxuICAgICAgLy8gTWFueSB2YWx1ZXMgb2YgYyB3aWxsIG5ldmVyIG9jY3VyLCBzaW5jZSBlLmcuIHg+eT56PncgbWFrZXMgeDx6LCB5PHcgYW5kIHg8d1xuICAgICAgLy8gaW1wb3NzaWJsZS4gT25seSB0aGUgMjQgaW5kaWNlcyB3aGljaCBoYXZlIG5vbi16ZXJvIGVudHJpZXMgbWFrZSBhbnkgc2Vuc2UuXG4gICAgICAvLyBXZSB1c2UgYSB0aHJlc2hvbGRpbmcgdG8gc2V0IHRoZSBjb29yZGluYXRlcyBpbiB0dXJuIGZyb20gdGhlIGxhcmdlc3QgbWFnbml0dWRlLlxuICAgICAgLy8gUmFuayAzIGRlbm90ZXMgdGhlIGxhcmdlc3QgY29vcmRpbmF0ZS5cbiAgICAgIGkxID0gcmFua3ggPj0gMyA/IDEgOiAwO1xuICAgICAgajEgPSByYW5reSA+PSAzID8gMSA6IDA7XG4gICAgICBrMSA9IHJhbmt6ID49IDMgPyAxIDogMDtcbiAgICAgIGwxID0gcmFua3cgPj0gMyA/IDEgOiAwO1xuICAgICAgLy8gUmFuayAyIGRlbm90ZXMgdGhlIHNlY29uZCBsYXJnZXN0IGNvb3JkaW5hdGUuXG4gICAgICBpMiA9IHJhbmt4ID49IDIgPyAxIDogMDtcbiAgICAgIGoyID0gcmFua3kgPj0gMiA/IDEgOiAwO1xuICAgICAgazIgPSByYW5reiA+PSAyID8gMSA6IDA7XG4gICAgICBsMiA9IHJhbmt3ID49IDIgPyAxIDogMDtcbiAgICAgIC8vIFJhbmsgMSBkZW5vdGVzIHRoZSBzZWNvbmQgc21hbGxlc3QgY29vcmRpbmF0ZS5cbiAgICAgIGkzID0gcmFua3ggPj0gMSA/IDEgOiAwO1xuICAgICAgajMgPSByYW5reSA+PSAxID8gMSA6IDA7XG4gICAgICBrMyA9IHJhbmt6ID49IDEgPyAxIDogMDtcbiAgICAgIGwzID0gcmFua3cgPj0gMSA/IDEgOiAwO1xuICAgICAgLy8gVGhlIGZpZnRoIGNvcm5lciBoYXMgYWxsIGNvb3JkaW5hdGUgb2Zmc2V0cyA9IDEsIHNvIG5vIG5lZWQgdG8gY29tcHV0ZSB0aGF0LlxuICAgICAgdmFyIHgxID0geDAgLSBpMSArIEc0OyAvLyBPZmZzZXRzIGZvciBzZWNvbmQgY29ybmVyIGluICh4LHkseix3KSBjb29yZHNcbiAgICAgIHZhciB5MSA9IHkwIC0gajEgKyBHNDtcbiAgICAgIHZhciB6MSA9IHowIC0gazEgKyBHNDtcbiAgICAgIHZhciB3MSA9IHcwIC0gbDEgKyBHNDtcbiAgICAgIHZhciB4MiA9IHgwIC0gaTIgKyAyLjAgKiBHNDsgLy8gT2Zmc2V0cyBmb3IgdGhpcmQgY29ybmVyIGluICh4LHkseix3KSBjb29yZHNcbiAgICAgIHZhciB5MiA9IHkwIC0gajIgKyAyLjAgKiBHNDtcbiAgICAgIHZhciB6MiA9IHowIC0gazIgKyAyLjAgKiBHNDtcbiAgICAgIHZhciB3MiA9IHcwIC0gbDIgKyAyLjAgKiBHNDtcbiAgICAgIHZhciB4MyA9IHgwIC0gaTMgKyAzLjAgKiBHNDsgLy8gT2Zmc2V0cyBmb3IgZm91cnRoIGNvcm5lciBpbiAoeCx5LHosdykgY29vcmRzXG4gICAgICB2YXIgeTMgPSB5MCAtIGozICsgMy4wICogRzQ7XG4gICAgICB2YXIgejMgPSB6MCAtIGszICsgMy4wICogRzQ7XG4gICAgICB2YXIgdzMgPSB3MCAtIGwzICsgMy4wICogRzQ7XG4gICAgICB2YXIgeDQgPSB4MCAtIDEuMCArIDQuMCAqIEc0OyAvLyBPZmZzZXRzIGZvciBsYXN0IGNvcm5lciBpbiAoeCx5LHosdykgY29vcmRzXG4gICAgICB2YXIgeTQgPSB5MCAtIDEuMCArIDQuMCAqIEc0O1xuICAgICAgdmFyIHo0ID0gejAgLSAxLjAgKyA0LjAgKiBHNDtcbiAgICAgIHZhciB3NCA9IHcwIC0gMS4wICsgNC4wICogRzQ7XG4gICAgICAvLyBXb3JrIG91dCB0aGUgaGFzaGVkIGdyYWRpZW50IGluZGljZXMgb2YgdGhlIGZpdmUgc2ltcGxleCBjb3JuZXJzXG4gICAgICB2YXIgaWkgPSBpICYgMjU1O1xuICAgICAgdmFyIGpqID0gaiAmIDI1NTtcbiAgICAgIHZhciBrayA9IGsgJiAyNTU7XG4gICAgICB2YXIgbGwgPSBsICYgMjU1O1xuICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBjb250cmlidXRpb24gZnJvbSB0aGUgZml2ZSBjb3JuZXJzXG4gICAgICB2YXIgdDAgPSAwLjYgLSB4MCAqIHgwIC0geTAgKiB5MCAtIHowICogejAgLSB3MCAqIHcwO1xuICAgICAgaWYgKHQwIDwgMCkgbjAgPSAwLjA7XG4gICAgICBlbHNlIHtcbiAgICAgICAgdmFyIGdpMCA9IChwZXJtW2lpICsgcGVybVtqaiArIHBlcm1ba2sgKyBwZXJtW2xsXV1dXSAlIDMyKSAqIDQ7XG4gICAgICAgIHQwICo9IHQwO1xuICAgICAgICBuMCA9IHQwICogdDAgKiAoZ3JhZDRbZ2kwXSAqIHgwICsgZ3JhZDRbZ2kwICsgMV0gKiB5MCArIGdyYWQ0W2dpMCArIDJdICogejAgKyBncmFkNFtnaTAgKyAzXSAqIHcwKTtcbiAgICAgIH1cbiAgICAgIHZhciB0MSA9IDAuNiAtIHgxICogeDEgLSB5MSAqIHkxIC0gejEgKiB6MSAtIHcxICogdzE7XG4gICAgICBpZiAodDEgPCAwKSBuMSA9IDAuMDtcbiAgICAgIGVsc2Uge1xuICAgICAgICB2YXIgZ2kxID0gKHBlcm1baWkgKyBpMSArIHBlcm1bamogKyBqMSArIHBlcm1ba2sgKyBrMSArIHBlcm1bbGwgKyBsMV1dXV0gJSAzMikgKiA0O1xuICAgICAgICB0MSAqPSB0MTtcbiAgICAgICAgbjEgPSB0MSAqIHQxICogKGdyYWQ0W2dpMV0gKiB4MSArIGdyYWQ0W2dpMSArIDFdICogeTEgKyBncmFkNFtnaTEgKyAyXSAqIHoxICsgZ3JhZDRbZ2kxICsgM10gKiB3MSk7XG4gICAgICB9XG4gICAgICB2YXIgdDIgPSAwLjYgLSB4MiAqIHgyIC0geTIgKiB5MiAtIHoyICogejIgLSB3MiAqIHcyO1xuICAgICAgaWYgKHQyIDwgMCkgbjIgPSAwLjA7XG4gICAgICBlbHNlIHtcbiAgICAgICAgdmFyIGdpMiA9IChwZXJtW2lpICsgaTIgKyBwZXJtW2pqICsgajIgKyBwZXJtW2trICsgazIgKyBwZXJtW2xsICsgbDJdXV1dICUgMzIpICogNDtcbiAgICAgICAgdDIgKj0gdDI7XG4gICAgICAgIG4yID0gdDIgKiB0MiAqIChncmFkNFtnaTJdICogeDIgKyBncmFkNFtnaTIgKyAxXSAqIHkyICsgZ3JhZDRbZ2kyICsgMl0gKiB6MiArIGdyYWQ0W2dpMiArIDNdICogdzIpO1xuICAgICAgfVxuICAgICAgdmFyIHQzID0gMC42IC0geDMgKiB4MyAtIHkzICogeTMgLSB6MyAqIHozIC0gdzMgKiB3MztcbiAgICAgIGlmICh0MyA8IDApIG4zID0gMC4wO1xuICAgICAgZWxzZSB7XG4gICAgICAgIHZhciBnaTMgPSAocGVybVtpaSArIGkzICsgcGVybVtqaiArIGozICsgcGVybVtrayArIGszICsgcGVybVtsbCArIGwzXV1dXSAlIDMyKSAqIDQ7XG4gICAgICAgIHQzICo9IHQzO1xuICAgICAgICBuMyA9IHQzICogdDMgKiAoZ3JhZDRbZ2kzXSAqIHgzICsgZ3JhZDRbZ2kzICsgMV0gKiB5MyArIGdyYWQ0W2dpMyArIDJdICogejMgKyBncmFkNFtnaTMgKyAzXSAqIHczKTtcbiAgICAgIH1cbiAgICAgIHZhciB0NCA9IDAuNiAtIHg0ICogeDQgLSB5NCAqIHk0IC0gejQgKiB6NCAtIHc0ICogdzQ7XG4gICAgICBpZiAodDQgPCAwKSBuNCA9IDAuMDtcbiAgICAgIGVsc2Uge1xuICAgICAgICB2YXIgZ2k0ID0gKHBlcm1baWkgKyAxICsgcGVybVtqaiArIDEgKyBwZXJtW2trICsgMSArIHBlcm1bbGwgKyAxXV1dXSAlIDMyKSAqIDQ7XG4gICAgICAgIHQ0ICo9IHQ0O1xuICAgICAgICBuNCA9IHQ0ICogdDQgKiAoZ3JhZDRbZ2k0XSAqIHg0ICsgZ3JhZDRbZ2k0ICsgMV0gKiB5NCArIGdyYWQ0W2dpNCArIDJdICogejQgKyBncmFkNFtnaTQgKyAzXSAqIHc0KTtcbiAgICAgIH1cbiAgICAgIC8vIFN1bSB1cCBhbmQgc2NhbGUgdGhlIHJlc3VsdCB0byBjb3ZlciB0aGUgcmFuZ2UgWy0xLDFdXG4gICAgICByZXR1cm4gMjcuMCAqIChuMCArIG4xICsgbjIgKyBuMyArIG40KTtcbiAgICB9XG4gIH07XG5cbiAgZnVuY3Rpb24gYnVpbGRQZXJtdXRhdGlvblRhYmxlKHJhbmRvbSkge1xuICAgIHZhciBpO1xuICAgIHZhciBwID0gbmV3IFVpbnQ4QXJyYXkoMjU2KTtcbiAgICBmb3IgKGkgPSAwOyBpIDwgMjU2OyBpKyspIHtcbiAgICAgIHBbaV0gPSBpO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgMjU1OyBpKyspIHtcbiAgICAgIHZhciByID0gaSArIH5+KHJhbmRvbSgpICogKDI1NiAtIGkpKTtcbiAgICAgIHZhciBhdXggPSBwW2ldO1xuICAgICAgcFtpXSA9IHBbcl07XG4gICAgICBwW3JdID0gYXV4O1xuICAgIH1cbiAgICByZXR1cm4gcDtcbiAgfVxuICBTaW1wbGV4Tm9pc2UuX2J1aWxkUGVybXV0YXRpb25UYWJsZSA9IGJ1aWxkUGVybXV0YXRpb25UYWJsZTtcblxuICBmdW5jdGlvbiBhbGVhKCkge1xuICAgIC8vIEpvaGFubmVzIEJhYWfDuGUgPGJhYWdvZUBiYWFnb2UuY29tPiwgMjAxMFxuICAgIHZhciBzMCA9IDA7XG4gICAgdmFyIHMxID0gMDtcbiAgICB2YXIgczIgPSAwO1xuICAgIHZhciBjID0gMTtcblxuICAgIHZhciBtYXNoID0gbWFzaGVyKCk7XG4gICAgczAgPSBtYXNoKCcgJyk7XG4gICAgczEgPSBtYXNoKCcgJyk7XG4gICAgczIgPSBtYXNoKCcgJyk7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgczAgLT0gbWFzaChhcmd1bWVudHNbaV0pO1xuICAgICAgaWYgKHMwIDwgMCkge1xuICAgICAgICBzMCArPSAxO1xuICAgICAgfVxuICAgICAgczEgLT0gbWFzaChhcmd1bWVudHNbaV0pO1xuICAgICAgaWYgKHMxIDwgMCkge1xuICAgICAgICBzMSArPSAxO1xuICAgICAgfVxuICAgICAgczIgLT0gbWFzaChhcmd1bWVudHNbaV0pO1xuICAgICAgaWYgKHMyIDwgMCkge1xuICAgICAgICBzMiArPSAxO1xuICAgICAgfVxuICAgIH1cbiAgICBtYXNoID0gbnVsbDtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgdCA9IDIwOTE2MzkgKiBzMCArIGMgKiAyLjMyODMwNjQzNjUzODY5NjNlLTEwOyAvLyAyXi0zMlxuICAgICAgczAgPSBzMTtcbiAgICAgIHMxID0gczI7XG4gICAgICByZXR1cm4gczIgPSB0IC0gKGMgPSB0IHwgMCk7XG4gICAgfTtcbiAgfVxuICBmdW5jdGlvbiBtYXNoZXIoKSB7XG4gICAgdmFyIG4gPSAweGVmYzgyNDlkO1xuICAgIHJldHVybiBmdW5jdGlvbihkYXRhKSB7XG4gICAgICBkYXRhID0gZGF0YS50b1N0cmluZygpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIG4gKz0gZGF0YS5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgaCA9IDAuMDI1MTk2MDMyODI0MTY5MzggKiBuO1xuICAgICAgICBuID0gaCA+Pj4gMDtcbiAgICAgICAgaCAtPSBuO1xuICAgICAgICBoICo9IG47XG4gICAgICAgIG4gPSBoID4+PiAwO1xuICAgICAgICBoIC09IG47XG4gICAgICAgIG4gKz0gaCAqIDB4MTAwMDAwMDAwOyAvLyAyXjMyXG4gICAgICB9XG4gICAgICByZXR1cm4gKG4gPj4+IDApICogMi4zMjgzMDY0MzY1Mzg2OTYzZS0xMDsgLy8gMl4tMzJcbiAgICB9O1xuICB9XG5cbiAgLy8gYW1kXG4gIGlmICh0eXBlb2YgZGVmaW5lICE9PSAndW5kZWZpbmVkJyAmJiBkZWZpbmUuYW1kKSBkZWZpbmUoZnVuY3Rpb24oKSB7cmV0dXJuIFNpbXBsZXhOb2lzZTt9KTtcbiAgLy8gY29tbW9uIGpzXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIGV4cG9ydHMuU2ltcGxleE5vaXNlID0gU2ltcGxleE5vaXNlO1xuICAvLyBicm93c2VyXG4gIGVsc2UgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB3aW5kb3cuU2ltcGxleE5vaXNlID0gU2ltcGxleE5vaXNlO1xuICAvLyBub2RlanNcbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBTaW1wbGV4Tm9pc2U7XG4gIH1cblxufSkoKTtcbiIsIlxuZ2xvYmFsLkNBTlZBU19TS0VUQ0hfREVGQVVMVF9TVE9SQUdFX0tFWSA9IFwiRDpcXFxcTWFudWVsXFxcXGNhbnZhcy1za2V0Y2hcXFxcZXhhbXBsZXNcXFxcYW5pbWF0ZWQtc2NyaWJibGUtY3VydmVzLmpzXCI7XG4iXX0=
