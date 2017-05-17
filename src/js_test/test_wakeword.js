
// This is how we connect to the creator. IP and port.
// The IP is the IP I'm using and you need to edit it.
// By default, MALOS has its 0MQ ports open to the world.

// Every device is identified by a base port. Then the mapping works
// as follows:
// BasePort     => Configuration port. Used to config the device.
// BasePort + 1 => Keepalive port. Send pings to this port.
// BasePort + 2 => Error port. Receive errros from device.
// BasePort + 3 => Data port. Receive data from device.

var creator_ip = '127.0.0.1';
var creator_wakeword_base_port = 60001;
var protoBuf = require("protobufjs");
var zmq = require('zmq');

var protoBuilder = protoBuf.loadProtoFile('../../protocol-buffers/malos/driver.proto');
var matrixMalosBuilder = protoBuilder.build("matrix_malos");
var configSocket = zmq.socket('push')
configSocket.connect('tcp://' + creator_ip + ':' + creator_wakeword_base_port /* config */)

// ********** Start error management.
var errorSocket = zmq.socket('sub')
errorSocket.connect('tcp://' + creator_ip + ':' + (creator_wakeword_base_port + 2))
errorSocket.subscribe('')
errorSocket.on('message', function(error_message) {
  process.stdout.write('Received Wakeword error: ' + error_message.toString('utf8') + "\n")
});
// ********** End error management.

/**************************************
 * start/stop service functions
 **************************************/

function startWakeUpRecognition(){
  console.log('<== config wakeword recognition..')
  var wakeword_config = new matrixMalosBuilder.WakeWordParams;
  wakeword_config.set_wake_word("MATRIX");
  wakeword_config.set_channel(matrixMalosBuilder.WakeWordParams.MicChannel.channel0);
  wakeword_config.set_lm_path("/home/pi/assets/6706.lm");
  wakeword_config.set_dic_path("/home/pi/assets/6706.dic");
  wakeword_config.set_enable_verbose(false)
  sendConfigProto(wakeword_config);
}

function stopWakeUpRecognition(){
  console.log('<== stop wakeword recognition..')
  var wakeword_config = new matrixMalosBuilder.WakeWordParams;
  wakeword_config.set_stop_recognition(true)
  sendConfigProto(wakeword_config);
}

/**************************************
 * Register wakeword callbacks
 **************************************/

var updateSocket = zmq.socket('sub')
updateSocket.connect('tcp://' + creator_ip + ':' + (creator_wakeword_base_port + 3))
updateSocket.subscribe('')

updateSocket.on('message', function(wakeword_buffer) {
  var wakeWordData = new matrixMalosBuilder.WakeWordParams.decode(wakeword_buffer)
  console.log('==> WakeWord Reached:',wakeWordData.wake_word)
});

/**************************************
 * sendConfigProto: build Proto message 
 **************************************/

function sendConfigProto(cfg){
  var config = new matrixMalosBuilder.DriverConfig
  config.set_wakeword(cfg)
  configSocket.send(config.encode().toBuffer())
}

/**********************************************
 ****************** MAIN **********************
 **********************************************/

startWakeUpRecognition();

//setTimeout(function() {
//  stopWakeUpRecognition()
//}, 10000);
