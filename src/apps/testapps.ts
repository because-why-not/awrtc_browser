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
import * as awrtc from "../awrtc/index"
import {DefaultValues, GetRandomKey} from "./apphelpers"
import { DeviceApi, DeviceInfo, BrowserMediaStream } from "../awrtc/index";

//This file only contains badly maintained
//test apps. Use only experimentation. 
//For proper examples look at examples.ts

//testapp to run a full connection test using the CAPI
//which is used by the unity WebGL plugin
export function CAPI_WebRtcNetwork_testapp() {
    console.log("test1");

    var testMessage = "test1234";


    //var configuration = "{ \"signaling\" :  { \"class\": \"WebsocketNetwork\", \"param\" : \"ws://localhost:12776\"}, \"iceServers\":[\"stun:stun.l.google.com:19302\"]}";
    var configuration = "{ \"signaling\" :  { \"class\": \"LocalNetwork\", \"param\" : null}, \"iceServers\":[{\"urls\": \"stun:stun.l.google.com:19302\"}]}";

    var srv = awrtc.CAPI_WebRtcNetwork_Create(configuration);
    awrtc.CAPI_WebRtcNetwork_StartServer(srv, "Room1");

    var clt = awrtc.CAPI_WebRtcNetwork_Create(configuration);


    setInterval(() => {

        awrtc.CAPI_WebRtcNetwork_Update(srv);



        var evt = null;
        while (evt = awrtc.CAPI_WebRtcNetwork_Dequeue(srv)) {

            console.log("server inc: " + evt.toString());

            if (evt.Type == awrtc.NetEventType.ServerInitialized) {
                console.log("server started. Address " + evt.Info);
                awrtc.CAPI_WebRtcNetwork_Connect(clt, evt.Info);

            } else if (evt.Type == awrtc.NetEventType.ServerInitFailed) {
                console.error("server start failed");
            } else if (evt.Type == awrtc.NetEventType.NewConnection) {
                console.log("server new incoming connection");
            } else if (evt.Type == awrtc.NetEventType.Disconnected) {
                console.log("server peer disconnected");
                console.log("server shutdown");
                awrtc.CAPI_WebRtcNetwork_Shutdown(srv);
            } else if (evt.Type == awrtc.NetEventType.ReliableMessageReceived) {
                //srv.SendData(evt.ConnectionId, evt.MessageData, true);
                awrtc.CAPI_WebRtcNetwork_SendData(srv, evt.ConnectionId.id, evt.MessageData, true);
            } else if (evt.Type == awrtc.NetEventType.UnreliableMessageReceived) {
                //srv.SendData(evt.ConnectionId, evt.MessageData, false);
                awrtc.CAPI_WebRtcNetwork_SendData(srv, evt.ConnectionId.id, evt.MessageData, false);
            }
        }
        //srv.Flush();
        awrtc.CAPI_WebRtcNetwork_Flush(srv);

        //clt.Update();
        awrtc.CAPI_WebRtcNetwork_Update(clt);
        while (evt = awrtc.CAPI_WebRtcNetwork_Dequeue(clt)) {

            console.log("client inc: " + evt.toString());

            if (evt.Type == awrtc.NetEventType.NewConnection) {
                console.log("client connection established");

                let buff = awrtc.Encoding.UTF16.GetBytes(testMessage);
                //clt.SendData(evt.ConnectionId, buff, true);
                awrtc.CAPI_WebRtcNetwork_SendData(clt, evt.ConnectionId.id, buff, true);
            } else if (evt.Type == awrtc.NetEventType.ReliableMessageReceived) {

                //check last message
                let str = awrtc.Encoding.UTF16.GetString(evt.MessageData);
                if (str != testMessage) {
                    console.error("Test failed sent string %s but received string %s", testMessage, str);
                }



                let buff = awrtc.Encoding.UTF16.GetBytes(testMessage);
                //clt.SendData(evt.ConnectionId, buff, false);
                awrtc.CAPI_WebRtcNetwork_SendData(clt, evt.ConnectionId.id, buff, false);
            } else if (evt.Type == awrtc.NetEventType.UnreliableMessageReceived) {
                let str = awrtc.Encoding.UTF16.GetString(evt.MessageData);
                if (str != testMessage) {
                    console.error("Test failed sent string %s but received string %s", testMessage, str);
                }

                console.log("client disconnecting");
                //clt.Disconnect(evt.ConnectionId);
                awrtc.CAPI_WebRtcNetwork_Disconnect(clt, evt.ConnectionId.id);
                console.log("client shutting down");
                //clt.Shutdown();
                awrtc.CAPI_WebRtcNetwork_Shutdown(clt);
            }
        }
        //clt.Flush();
        awrtc.CAPI_WebRtcNetwork_Flush(clt);
    }, 100);
}
//for testing the media API used by the unity plugin
export function CAPI_MediaNetwork_testapp()
{
    awrtc.BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
    
    var signalingUrl : string = DefaultValues.Signaling;
    let lIndex = awrtc.CAPI_MediaNetwork_Create("{\"IceUrls\":[\"stun:stun.l.google.com:19302\"], \"SignalingUrl\":\"ws://because-why-not.com:12776\"}");

    let configDone = false;
    awrtc.CAPI_MediaNetwork_Configure(lIndex, true, true, 160, 120, 640, 480, 640, 480, -1, -1, -1);
    console.log(awrtc.CAPI_MediaNetwork_GetConfigurationState(lIndex));

    let startTime = new Date().getTime();

    let mainLoop = function () {

        awrtc.CAPI_WebRtcNetwork_Update(lIndex);
        if (awrtc.CAPI_MediaNetwork_GetConfigurationState(lIndex) == (awrtc.MediaConfigurationState.Successful as number) && configDone == false) {
            configDone = true;
            console.log("configuration done");
        }

        if (awrtc.CAPI_MediaNetwork_GetConfigurationState(lIndex) == (awrtc.MediaConfigurationState.Failed as number)) {
            alert("configuration failed");
        }
        if (configDone == false)
            console.log(awrtc.CAPI_MediaNetwork_GetConfigurationState(lIndex));

        if ((new Date().getTime() - startTime) < 15000) {
            window.requestAnimationFrame(mainLoop);
        } else {
            console.log("shutting down");
            awrtc.CAPI_WebRtcNetwork_Release(lIndex);
        }
    }
    window.requestAnimationFrame(mainLoop);
}


//Tests shared address feature of the WebsocketNetwork
export function WebsocketNetwork_sharedaddress() {
    console.log("WebsocketNetwork shared address test");

    var testMessage = "test1234";

    var local = true;
    var allowUnsafe = true;

    var url : string = DefaultValues.SignalingShared;

    let address = "sharedaddresstest";
    var network1 = new awrtc.WebsocketNetwork(url);
    var network2 = new awrtc.WebsocketNetwork(url);
    var network3 = new awrtc.WebsocketNetwork(url);


    let network1Greeting = awrtc.Encoding.UTF16.GetBytes("network1 says hi");
    let network2Greeting = awrtc.Encoding.UTF16.GetBytes("network2 says hi");
    let network3Greeting = awrtc.Encoding.UTF16.GetBytes("network3 says hi");

    //

    network1.StartServer(address);
    network2.StartServer(address);
    network3.StartServer(address);



    function UpdateNetwork(network: awrtc.IBasicNetwork, name: string) {


        network.Update();

        var evt: awrtc.NetworkEvent = null;
        while (evt = network.Dequeue()) {

            if (evt.Type == awrtc.NetEventType.ServerInitFailed
                || evt.Type == awrtc.NetEventType.ConnectionFailed
                || evt.Type == awrtc.NetEventType.ServerClosed) {
                console.error(name + "inc: " + evt.toString());
            }
            else {
                console.log(name + "inc: " + evt.toString());
            }

            if (evt.Type == awrtc.NetEventType.ServerInitialized) {


            } else if (evt.Type == awrtc.NetEventType.ServerInitFailed) {

            } else if (evt.Type == awrtc.NetEventType.NewConnection) {

                let greeting = awrtc.Encoding.UTF16.GetBytes(name + "says hi!");
                network.SendData(evt.ConnectionId, greeting, true);

            } else if (evt.Type == awrtc.NetEventType.Disconnected) {

            } else if (evt.Type == awrtc.NetEventType.ReliableMessageReceived) {

                let str = awrtc.Encoding.UTF16.GetString(evt.MessageData)
                console.log(name + " received: " + str)
            } else if (evt.Type == awrtc.NetEventType.UnreliableMessageReceived) {

            }
        }
        network.Flush();
    }



    let time = 0;
    setInterval(() => {

        UpdateNetwork(network1, "network1 ");
        UpdateNetwork(network2, "network2 ");
        UpdateNetwork(network3, "network3 ");
        time += 100;

        if (time == 10000) {
            console.log("network1 shutdown");
            network1.Shutdown();
        }
        if (time == 15000) {
            console.log("network2 shutdown");
            network2.Shutdown();
        }
        if (time == 20000) {
            console.log("network3 shutdown");
            network3.Shutdown();
        }
    }, 100);
}

export function WebsocketNetwork_test1() 
{
    var testMessage = "test1234";

    
    var url : string = DefaultValues.Signaling;
    var srv = new awrtc.WebsocketNetwork(url);
    srv.StartServer();

    var clt = new awrtc.WebsocketNetwork(url);

    
    setInterval(() => {

        srv.Update();
        var evt : awrtc.NetworkEvent= null;
        while (evt = srv.Dequeue()) {

            console.log("server inc: " + evt.toString());

            if (evt.Type == awrtc.NetEventType.ServerInitialized) {
                console.log("server started. Address " + evt.Info);

                clt.Connect(evt.Info);
            } else if (evt.Type == awrtc.NetEventType.ServerInitFailed) {
                console.error("server start failed");
            } else if (evt.Type == awrtc.NetEventType.NewConnection) {
                console.log("server new incoming connection");
            } else if (evt.Type == awrtc.NetEventType.Disconnected) {
                console.log("server peer disconnected");
                console.log("server shutdown");
                srv.Shutdown();
            } else if (evt.Type == awrtc.NetEventType.ReliableMessageReceived) {
                srv.SendData(evt.ConnectionId, evt.MessageData, true);
            } else if (evt.Type == awrtc.NetEventType.UnreliableMessageReceived) {
                srv.SendData(evt.ConnectionId, evt.MessageData, false);
            }
        }
        srv.Flush();


        clt.Update();
        while (evt = clt.Dequeue()) {

            console.log("client inc: " + evt.toString());

            if (evt.Type == awrtc.NetEventType.NewConnection) {
                console.log("client connection established");

                let buff = awrtc.Encoding.UTF16.GetBytes(testMessage);
                clt.SendData(evt.ConnectionId, buff, true);
            } else if (evt.Type == awrtc.NetEventType.ReliableMessageReceived) {
                
                //check last message
                let str = awrtc.Encoding.UTF16.GetString(evt.MessageData);
                if (str != testMessage) {
                    console.error("Test failed sent string %s but received string %s", testMessage, str);
                }
            
                

                let buff = awrtc.Encoding.UTF16.GetBytes(testMessage);
                clt.SendData(evt.ConnectionId, buff, false);
            } else if (evt.Type == awrtc.NetEventType.UnreliableMessageReceived) {
                let str = awrtc.Encoding.UTF16.GetString(evt.MessageData);
                if (str != testMessage) {
                    console.error("Test failed sent string %s but received string %s", testMessage, str);
                }

                console.log("client disconnecting");
                clt.Disconnect(evt.ConnectionId);
                console.log("client shutting down");
                clt.Shutdown();
            }
        }
        clt.Flush();
    }, 100);
}

export function BrowserMediaNetwork_TestLocalCamera() {
    //first get the device names
    let handler : awrtc.DeviceApiOnChanged;
    handler = ()=>{
        awrtc.DeviceApi.RemOnChangedHandler(handler);
        BrowserMediaNetwork_TestLocalCameraInternal();
    };
    awrtc.DeviceApi.AddOnChangedHandler(handler);
    awrtc.DeviceApi.Update();
}
function BrowserMediaNetwork_TestLocalCameraInternal() {

    awrtc.BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
    let networkConfig = new awrtc.NetworkConfig();
    networkConfig.SignalingUrl = null;

    let network = new awrtc.BrowserMediaNetwork(networkConfig);

    let mediaConfig = new awrtc.MediaConfig();
    mediaConfig.Audio = true;
    mediaConfig.Video = true;

    //test setting a specifid device here
    let keys = Object.keys(awrtc.DeviceApi.Devices);
    mediaConfig.VideoDeviceName = "";//awrtc.DeviceApi.Devices[keys[0]].label;


    network.Configure(mediaConfig);


    setInterval(() => {
        network.Update();

        let frame = network.TryGetFrame(awrtc.ConnectionId.INVALID);
        if(frame != null)
            console.log("width" + frame.Width + " height:" + frame.Height + " data:" + frame.Buffer[0]);
        network.Flush();
    }, 50);
}


class FpsCounter
{
    lastRefresh = 0;
    fps = 0;
    counter = 0;
    isNew = false;

    public get Fps()
    {
        return Math.round(this.fps);
    }

    public get IsNew() : boolean
    {
        if(this.isNew){
            this.isNew  = false;
            return true;
        }
        return false;
    }

    Update():void
    {
        this.counter++;
        let diff = new Date().getTime() - this.lastRefresh;

        let refresh_time = 2000;
        if(diff > refresh_time)
        {
            this.fps = this.counter / (diff / 1000);
            this.counter = 0;
            this.lastRefresh = new Date().getTime();
            this.isNew = true;
        }
    }
}

//Sends video data between two peers within the same browser window
//and accesses the resulting frame data directly
export function BrowserMediaNetwork_frameaccess() {

    //BrowserMediaStream.DEFAULT_FRAMERATE = 60;
    //awrtc.BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;

    let address = GetRandomKey();
    let networkConfig = new awrtc.NetworkConfig();
    networkConfig.SignalingUrl = DefaultValues.Signaling;

    let network1 = new awrtc.BrowserMediaNetwork(networkConfig);

    let network2 = new awrtc.BrowserMediaNetwork(networkConfig);

    let mediaConfig1 = new awrtc.MediaConfig();
    mediaConfig1.Audio = false;
    mediaConfig1.Video = true;
    /*
    mediaConfig1.IdealWidth = 320;
    mediaConfig1.IdealHeight = 240;
    //fps seems to be ignored by browsers even if
    //the camera specifically supports that setting
    mediaConfig1.IdealFps = 15;
    */
    let mediaConfig2 = new awrtc.MediaConfig();
    mediaConfig2.Audio = false;
    mediaConfig2.Video = false;


    let localFps = new FpsCounter();
    let remoteFps = new FpsCounter();
    let loopRate = new FpsCounter();




    setTimeout(() => {

        network1.Configure(mediaConfig1);
    }, 5000);

    setTimeout(() => {

        console.log("connecting network1");
        network1.StartServer(address);
        //if (network2 != null)
            //network2.Configure(mediaConfig);
    }, 10000);


    setTimeout(() => {
        if (network2 != null) {
            console.log("connecting network2");
            network2.Connect(address);
        }
    }, 15000);

    var remoteConId1: awrtc.ConnectionId = null;
    var remoteConId2: awrtc.ConnectionId = null;

    setInterval(() => {
        network1.Update();
        loopRate.Update();
        if(loopRate.IsNew)
            console.log("Loop rate: " + loopRate.Fps);

        let frame1: awrtc.IFrameData = null;
        let frame2: awrtc.IFrameData = null;
        frame1 = network1.TryGetFrame(awrtc.ConnectionId.INVALID);
        if (frame1 != null)
        {
            localFps.Update();
            if(localFps.IsNew)
                console.log("local1  width" + frame1.Width + " height:" + frame1.Height + "fps: " + localFps.Fps + " data:" + frame1.Buffer[0]);
            
        }

        var evt: awrtc.NetworkEvent;
        while ((evt = network1.Dequeue()) != null) {
            console.log("network1: " + evt.toString());
            if (evt.Type == awrtc.NetEventType.NewConnection) {
                remoteConId1 = evt.ConnectionId;
            }
        }

        if (remoteConId1 != null) {
            frame1 = network1.TryGetFrame(remoteConId1);
            if (frame1 != null)
                console.log("remote1 width" + frame1.Width + " height:" + frame1.Height + " data:" + frame1.Buffer[0]);
        }

        network1.Flush();

        if (network2 == null)
            return;
        network2.Update();
        frame2 = network2.TryGetFrame(awrtc.ConnectionId.INVALID);

        if (frame2 != null)
            console.log("local2  width" + frame2.Width + " height:" + frame2.Height + " data:" + frame2.Buffer[0]);


        while ((evt = network2.Dequeue()) != null) {
            console.log("network2: " + evt.toString());
            if (evt.Type == awrtc.NetEventType.NewConnection) {
                remoteConId2 = evt.ConnectionId;
            }
        }
        if (remoteConId2 != null) {
            frame2 = network2.TryGetFrame(remoteConId2);
            if (frame2 != null)
            {
                remoteFps.Update();
                if(remoteFps.IsNew)
                    console.log("remote2 width" + frame2.Width + " height:" + frame2.Height + "fps: " + remoteFps.Fps + " data:" + frame2.Buffer[0]);
            }
        }

        network2.Flush();
    }, 10);
}