import React, {Fragment} from 'react';

var contextClass = (window.AudioContext ||
    window.webkitAudioContext ||
    window.mozAudioContext ||
    window.oAudioContext ||
    window.msAudioContext);
var oscillator1 = null;
var oscillator2 = null;
if (contextClass) {
    // Web Audio API is available.
    var context = new contextClass();
}

var oscOn = function (freq1, freq2) {

    const merger = context.createChannelMerger(2);

    oscillator1 = context.createOscillator();
    oscillator1.type = 'sine';
    oscillator1.frequency.value = freq1;
    var gainNode = context.createGain ? context.createGain() : context.createGainNode();
    oscillator1.connect(gainNode, 0, 0);
    // gainNode.connect(context.destination,0,0);
    gainNode.gain.value = .1;
    oscillator1.start ? oscillator1.start(0) : oscillator1.noteOn(0)

    gainNode.connect(merger, 0, 1);

    oscillator2 = context.createOscillator();
    oscillator2.type = 'sine';
    oscillator2.frequency.value = freq2;
    gainNode = context.createGain ? context.createGain() : context.createGainNode();
    oscillator2.connect(gainNode);
    // gainNode.connect(context.destination,0,1);
    gainNode.connect(merger, 0, 0);


    gainNode.gain.value = .1;
    oscillator2.start ? oscillator2.start(0) : oscillator2.noteOn(0)

    merger.connect(context.destination);


};

function start(left, right) {
    if (oscillator1 != null) oscillator1.disconnect();
    if (oscillator2 != null) oscillator2.disconnect();
    oscOn(
        parseFloat(left),
        parseFloat(right)
    );
}


function stop() {
    if (oscillator1 != null) oscillator1.disconnect();
    if (oscillator2 != null) oscillator2.disconnect();
    console.log("hook")
}

export function Play() {
	const queryParams = new URLSearchParams(window.location.search);
	const leftEar = queryParams.get('leftEar');
	const rightEar = queryParams.get('rightEar');
	start(leftEar, rightEar);
	console.log(leftEar, rightEar);
	return (
        <br/>
	);
}

export function Stop() {
	stop();
	return (
		<Fragment>
			<h2 style={{textAlign: 'center', marginBottom: '10px'}}> Stoped! </h2>
		</Fragment>
	);
}
