/*
Copyright (c) 2019, because-why-not.com Limited
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/**This file contains the mapping between the awrtc_browser library and
 * Unitys WebGL support. Not needed for regular use.
 */
import {SLog, WebRtcNetwork, SignalingConfig, NetworkEvent, ConnectionId, LocalNetwork, WebsocketNetwork} from "../network/index"
import { MediaConfigurationState, NetworkConfig, MediaConfig } from "../media/index";
import { BrowserMediaStream, BrowserMediaNetwork, DeviceApi, BrowserWebRtcCall } from "../media_browser/index";


var CAPI_InitMode = {
    //Original mode. Devices will be unknown after startup
    Default: 0,
    //Waits for the desvice info to come in
    //names might be missing though (browser security thing)
    WaitForDevices: 1,
    //Asks the user for camera / audio access to be able to
    //get accurate device information
    RequestAccess: 2
  };

var CAPI_InitState = {
    Uninitialized: 0,
    Initializing: 1,
    Initialized: 2,
    Failed: 3
  };
var gCAPI_InitState = CAPI_InitState.Uninitialized;

export function CAPI_InitAsync(initmode) 
{
    console.debug("CAPI_InitAsync mode: " + initmode);
    gCAPI_InitState = CAPI_InitState.Initializing;
    let hasDevApi = DeviceApi.IsApiAvailable();
    if( hasDevApi && initmode == CAPI_InitMode.WaitForDevices)
    {
        DeviceApi.Update();
    }else if(hasDevApi && initmode == CAPI_InitMode.RequestAccess)
    {
        DeviceApi.RequestUpdate();
    }else{
        //either no device access available or not requested. Switch
        //to init state immediately without device info
        gCAPI_InitState = CAPI_InitState.Initialized;
        if(hasDevApi == false)
        {
            console.debug("Initialized without accessible DeviceAPI");
        }
    }
}
export function CAPI_PollInitState() 
{
    //keep checking if the DeviceApi left pending state
    //Once completed init is finished.
    //Later we might do more here
    if(DeviceApi.IsPending == false && gCAPI_InitState == CAPI_InitState.Initializing)
    {
        gCAPI_InitState = CAPI_InitState.Initialized;
        console.debug("Init completed.");
    }
    return gCAPI_InitState;
}

/**
 * 
 * @param loglevel 
 * None = 0,
 * Errors = 1,
 * Warnings = 2,
 * Verbose = 3
 */
export function CAPI_SLog_SetLogLevel(loglevel:number)
{
    if(loglevel < 0 || loglevel > 3)
    {
        SLog.LogError("Invalid log level " + loglevel);
        return;
    }
    SLog.SetLogLevel(loglevel);
}



var gCAPI_WebRtcNetwork_Instances: { [id: number]: WebRtcNetwork }= {};
var gCAPI_WebRtcNetwork_InstancesNextIndex = 1;


export function CAPI_WebRtcNetwork_IsAvailable() {
    //used by C# component to check if this plugin is loaded.
    //can only go wrong due to programming error / packaging
    if(WebRtcNetwork && WebsocketNetwork)
        return true;
    return false;
}


export function CAPI_WebRtcNetwork_IsBrowserSupported() 
{
    if (RTCPeerConnection && RTCDataChannel)
        return true;

    return false;
}


export function CAPI_WebRtcNetwork_Create(lConfiguration: string) {
    var lIndex = gCAPI_WebRtcNetwork_InstancesNextIndex;
    gCAPI_WebRtcNetwork_InstancesNextIndex++;

    var signaling_class = "LocalNetwork";
    var signaling_param: any = null;
    var iceServers: RTCIceServer[];

    if (lConfiguration == null || typeof lConfiguration !== 'string' || lConfiguration.length === 0) {

        SLog.LogError("invalid configuration. Returning -1! Config: " + lConfiguration);
        return -1;
    }
    else {
        
        var conf = JSON.parse(lConfiguration);

        if (conf) {

            if (conf.signaling) {
                signaling_class = conf.signaling.class;
                signaling_param = conf.signaling.param;
            }
            if (conf.iceServers) {
                iceServers = conf.iceServers;
            }
            SLog.L(signaling_class);
            //this seems to be broken after switch to modules
            //let signalingNetworkClass = window[signaling_class];
            //let signalingNetworkClass =  new (<any>window)["awrtc.LocalNetwork"];
            //console.debug(signalingNetworkClass);
            let signalingNetworkClass : any;
            if(signaling_class === "LocalNetwork")
            {
                signalingNetworkClass = LocalNetwork;
            }else{
                signalingNetworkClass = WebsocketNetwork;
            }

            let signalingConfig = new SignalingConfig(new signalingNetworkClass(signaling_param));

            
            let rtcConfiguration: RTCConfiguration = { iceServers: iceServers };

            gCAPI_WebRtcNetwork_Instances[lIndex] = new WebRtcNetwork(signalingConfig, rtcConfiguration);
        } else {
            SLog.LogWarning("Parsing configuration failed. Configuration: " + lConfiguration);
            return -1;
        }
    }
    //gCAPI_WebRtcNetwork_Instances[lIndex].OnLog = function (lMsg) {
    //    console.debug(lMsg);
    //};
    return lIndex;
}

export function CAPI_WebRtcNetwork_Release(lIndex: number) {
    if (lIndex in gCAPI_WebRtcNetwork_Instances) {
        gCAPI_WebRtcNetwork_Instances[lIndex].Dispose();
        delete gCAPI_WebRtcNetwork_Instances[lIndex];
    }
}

export function CAPI_WebRtcNetwork_Connect(lIndex: number, lRoom: string) {
    return gCAPI_WebRtcNetwork_Instances[lIndex].Connect(lRoom);
}

export function CAPI_WebRtcNetwork_StartServer(lIndex: number, lRoom: string) {
    gCAPI_WebRtcNetwork_Instances[lIndex].StartServer(lRoom);
}
export function CAPI_WebRtcNetwork_StopServer(lIndex: number) {
    gCAPI_WebRtcNetwork_Instances[lIndex].StopServer();
}
export function CAPI_WebRtcNetwork_Disconnect(lIndex: number, lConnectionId: number) {
    gCAPI_WebRtcNetwork_Instances[lIndex].Disconnect(new ConnectionId(lConnectionId));
}

export function CAPI_WebRtcNetwork_Shutdown(lIndex: number) {
    gCAPI_WebRtcNetwork_Instances[lIndex].Shutdown();
}

export function CAPI_WebRtcNetwork_Update(lIndex: number) {
    gCAPI_WebRtcNetwork_Instances[lIndex].Update();
}

export function CAPI_WebRtcNetwork_Flush(lIndex: number) {
    gCAPI_WebRtcNetwork_Instances[lIndex].Flush();
}

export function CAPI_WebRtcNetwork_SendData(lIndex: number, lConnectionId: number, lUint8ArrayData: Uint8Array, lReliable: boolean) {
    gCAPI_WebRtcNetwork_Instances[lIndex].SendData(new ConnectionId(lConnectionId), lUint8ArrayData, lReliable);
}

//helper for emscripten
export function CAPI_WebRtcNetwork_SendDataEm(lIndex: number, lConnectionId: number, lUint8ArrayData: Uint8Array, lUint8ArrayDataOffset: number, lUint8ArrayDataLength: number, lReliable: boolean) {
    //console.debug("SendDataEm: " + lReliable + " length " + lUint8ArrayDataLength + " to " + lConnectionId);
    var arrayBuffer = new Uint8Array(lUint8ArrayData.buffer, lUint8ArrayDataOffset, lUint8ArrayDataLength);
    return gCAPI_WebRtcNetwork_Instances[lIndex].SendData(new ConnectionId(lConnectionId), arrayBuffer, lReliable);
}

export function CAPI_WebRtcNetwork_GetBufferedAmount(lIndex: number, lConnectionId: number, lReliable: boolean) {
    return gCAPI_WebRtcNetwork_Instances[lIndex].GetBufferedAmount(new ConnectionId(lConnectionId), lReliable);
}


export function CAPI_WebRtcNetwork_Dequeue(lIndex: number): NetworkEvent {
    return gCAPI_WebRtcNetwork_Instances[lIndex].Dequeue();
}
export function CAPI_WebRtcNetwork_Peek(lIndex: number): NetworkEvent {
    return gCAPI_WebRtcNetwork_Instances[lIndex].Peek();
}

/**Allows to peek into the next event to figure out its length and allocate
 * the memory needed to store it before calling
 *      CAPI_WebRtcNetwork_DequeueEm
 * 
 * @param {type} lIndex
 * @returns {Number}
 */
export function CAPI_WebRtcNetwork_PeekEventDataLength(lIndex) {
    var lNetEvent = gCAPI_WebRtcNetwork_Instances[lIndex].Peek();
    return CAPI_WebRtcNetwork_CheckEventLength(lNetEvent);
}
//helper
export function CAPI_WebRtcNetwork_CheckEventLength(lNetEvent: NetworkEvent) {
    if (lNetEvent == null) {
        //invalid event
        return -1;
    } else if (lNetEvent.RawData == null) {
        //no data
        return 0;
    } else if (typeof lNetEvent.RawData === "string") {
        //no user strings are allowed thus we get away with counting the characters
        //(ASCII only!)
        return lNetEvent.RawData.length;
    } else //message event types 1 and 2 only? check for it?
    {
        //its not null and not a string. can only be a Uint8Array if we didn't
        //mess something up in the implementation

        return lNetEvent.RawData.length;
    }
}
export function CAPI_WebRtcNetwork_EventDataToUint8Array(data: any, dataUint8Array: Uint8Array, dataOffset: number, dataLength: number) {
    //data can be null, string or Uint8Array
    //return value will be the length of data we used
    if (data == null) {
        return 0;
    } else if ((typeof data) === "string") {
        //in case we don't get a large enough array we need to cut off the string
        var i = 0;
        for (i = 0; i < data.length && i < dataLength; i++) {
            dataUint8Array[dataOffset + i] = data.charCodeAt(i);
        }
        return i;
    }
    else {
        var i = 0;
        //in case we don't get a large enough array we need to cut off the string
        for (i = 0; i < data.length && i < dataLength; i++) {
            dataUint8Array[dataOffset + i] = data[i];
        }
        return i;
    }
}

//Version for emscripten or anything that doesn't have a garbage collector.
// The memory for everything needs to be allocated before the call.

export function CAPI_WebRtcNetwork_DequeueEm(lIndex: number, lTypeIntArray: Int32Array, lTypeIntIndex: number, lConidIntArray: Int32Array, lConidIndex: number, lDataUint8Array: Uint8Array, lDataOffset: number, lDataLength: number, lDataLenIntArray: Int32Array, lDataLenIntIndex: number) {
    var nEvt = CAPI_WebRtcNetwork_Dequeue(lIndex);
    if (nEvt == null)
        return false;

    lTypeIntArray[lTypeIntIndex] = nEvt.Type;
    lConidIntArray[lConidIndex] = nEvt.ConnectionId.id;

    //console.debug("event" + nEvt.netEventType);
    var length = CAPI_WebRtcNetwork_EventDataToUint8Array(nEvt.RawData, lDataUint8Array, lDataOffset, lDataLength);
    lDataLenIntArray[lDataLenIntIndex] = length; //return the length if so the user knows how much of the given array is used

    return true;
}
export function CAPI_WebRtcNetwork_PeekEm(lIndex: number, lTypeIntArray: Int32Array, lTypeIntIndex: number, lConidIntArray: Int32Array, lConidIndex: number, lDataUint8Array: Uint8Array, lDataOffset: number, lDataLength: number, lDataLenIntArray: Int32Array, lDataLenIntIndex: number) {
    var nEvt = CAPI_WebRtcNetwork_Peek(lIndex);
    if (nEvt == null)
        return false;

    lTypeIntArray[lTypeIntIndex] = nEvt.Type;
    lConidIntArray[lConidIndex] = nEvt.ConnectionId.id;

    //console.debug("event" + nEvt.netEventType);
    var length = CAPI_WebRtcNetwork_EventDataToUint8Array(nEvt.RawData, lDataUint8Array, lDataOffset, lDataLength);
    lDataLenIntArray[lDataLenIntIndex] = length; //return the length if so the user knows how much of the given array is used

    return true;
}



export function CAPI_MediaNetwork_IsAvailable() : boolean{

    if(BrowserMediaNetwork && BrowserWebRtcCall)
        return true;
    return false;
}

export function CAPI_MediaNetwork_HasUserMedia() : boolean{
    if(navigator && navigator.mediaDevices)
        return true;
    return false;
}

export function CAPI_MediaNetwork_Create(lJsonConfiguration):number {
    
    let config = new NetworkConfig();
    config = JSON.parse(lJsonConfiguration);

    let mediaNetwork = new BrowserMediaNetwork(config);

    var lIndex = gCAPI_WebRtcNetwork_InstancesNextIndex;
    gCAPI_WebRtcNetwork_InstancesNextIndex++;

    gCAPI_WebRtcNetwork_Instances[lIndex] = mediaNetwork;
    return lIndex;
}







//Configure(config: MediaConfig): void;
export function CAPI_MediaNetwork_Configure(lIndex:number, audio: boolean, video: boolean,
    minWidth: number, minHeight: number,
    maxWidth: number, maxHeight: number,
    idealWidth: number, idealHeight: number,
    minFps: number, maxFps: number, idealFps: number, deviceName: string = ""){

    let config: MediaConfig = new MediaConfig();
    config.Audio = audio;
    config.Video = video;
    config.MinWidth = minWidth;
    config.MinHeight = minHeight;
    config.MaxWidth = maxWidth;
    config.MaxHeight = maxHeight;
    config.IdealWidth = idealWidth;
    config.IdealHeight = idealHeight;

    config.MinFps = minFps;
    config.MaxFps = maxFps;
    config.IdealFps = idealFps;

    config.VideoDeviceName = deviceName;

    config.FrameUpdates = true;
    
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    mediaNetwork.Configure(config);

}
//GetConfigurationState(): MediaConfigurationState;
export function CAPI_MediaNetwork_GetConfigurationState(lIndex: number): number{
    
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    return mediaNetwork.GetConfigurationState() as number;
}

//Note: not yet glued to the C# version!
//GetConfigurationError(): string;
export function CAPI_MediaNetwork_GetConfigurationError(lIndex: number): string {
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    return mediaNetwork.GetConfigurationError();

}

//ResetConfiguration(): void;
export function CAPI_MediaNetwork_ResetConfiguration(lIndex: number) : void {
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    return mediaNetwork.ResetConfiguration();
}

//TryGetFrame(id: ConnectionId): RawFrame;
export function CAPI_MediaNetwork_TryGetFrame(lIndex: number, lConnectionId: number,
            lWidthInt32Array: Int32Array, lWidthIntArrayIndex: number, 
            lHeightInt32Array: Int32Array, lHeightIntArrayIndex: number,
            lBufferUint8Array: Uint8Array, lBufferUint8ArrayOffset: number, lBufferUint8ArrayLength: number): boolean
{
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    let frame = mediaNetwork.TryGetFrame(new ConnectionId(lConnectionId));

    if (frame == null || frame.Buffer == null) {
        return false;
    } else {


        //TODO: copy frame over
        lWidthInt32Array[lWidthIntArrayIndex] = frame.Width;
        lHeightInt32Array[lHeightIntArrayIndex] = frame.Height;

        for (let i = 0; i < lBufferUint8ArrayLength && i < frame.Buffer.length; i++) {
            lBufferUint8Array[lBufferUint8ArrayOffset + i] = frame.Buffer[i];
        }
        return true;
    }
}

//Returns the frame buffer size or -1 if no frame is available
export function CAPI_MediaNetwork_TryGetFrameDataLength(lIndex: number, connectionId: number) : number {
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    let frame = mediaNetwork.PeekFrame(new ConnectionId(connectionId));

    let length: number = -1;
    //added frame.Buffer != null as the frame might be a LazyFrame just creating a copy of the html video element
    //in the moment frame.Buffer is called. if this fails for any reasion it might return null despite
    //the frame object itself being available
    if (frame != null && frame.Buffer != null) {
        length = frame.Buffer.length;
    }

    //SLog.L("data length:" + length);
    return length;
}
export function CAPI_MediaNetwork_SetVolume(lIndex: number, volume: number, connectionId: number) : void {

    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    mediaNetwork.SetVolume(volume, new ConnectionId(connectionId));
}

export function CAPI_MediaNetwork_HasAudioTrack(lIndex: number, connectionId: number): boolean
{
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    return mediaNetwork.HasAudioTrack(new ConnectionId(connectionId));
}
export function CAPI_MediaNetwork_HasVideoTrack(lIndex: number, connectionId: number): boolean {

    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    return mediaNetwork.HasVideoTrack(new ConnectionId(connectionId));
}

export function CAPI_MediaNetwork_SetMute(lIndex: number, value: boolean)
{
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    mediaNetwork.SetMute(value);
}

export function CAPI_MediaNetwork_IsMute(lIndex: number)
{
    let mediaNetwork = gCAPI_WebRtcNetwork_Instances[lIndex] as BrowserMediaNetwork;
    return mediaNetwork.IsMute();
}


export function CAPI_DeviceApi_Update():void
{
    DeviceApi.Update();
}
export function CAPI_DeviceApi_RequestUpdate():void
{
    DeviceApi.RequestUpdate();
}
export function CAPI_DeviceApi_LastUpdate():number
{
    return DeviceApi.LastUpdate;
}

export function CAPI_DeviceApi_Devices_Length():number{
    return Object.keys(DeviceApi.Devices).length;
}
export function CAPI_DeviceApi_Devices_Get(index:number):string{
    let keys = Object.keys(DeviceApi.Devices);
    if(keys.length > index)
    {
        let key = keys[index];
        return DeviceApi.Devices[key].label;
    }
    else
    {
        SLog.LE("Requested device with index " + index + " does not exist.");
        return "";
    }
}