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
import { DefaultValues, GetRandomKey, GetParameterByName } from "./apphelpers";
import { WebsocketNetwork } from "../awrtc/index";

//Creates two WebRtcNetwork objects and connects them
//directly + sends test messages
export function WebRtcNetwork_minimal() {
    console.log("test1");

    var testMessage = "test1234";

    var websocketurl: string = DefaultValues.Signaling;

    let rtcConfig: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] } as RTCIceServer] };


    var srv = new awrtc.WebRtcNetwork(new awrtc.SignalingConfig(new WebsocketNetwork(websocketurl)), rtcConfig);
    srv.StartServer();

    var clt = new awrtc.WebRtcNetwork(new awrtc.SignalingConfig(new WebsocketNetwork(websocketurl)), rtcConfig);


    setInterval(() => {

        srv.Update();
        var evt: awrtc.NetworkEvent = null;
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



interface IRemoteVideoDict {
    [connectionId: number]: HTMLVideoElement;
}
class MinimalCall
{
    //just a number we give each local call to
    //identify the output of each individual call
    mId:number = -1;
    mCall: awrtc.BrowserWebRtcCall = null;
    mLocalVideo: HTMLVideoElement = null;
    mRemoteVideo: IRemoteVideoDict = {};

    mNetConfig: awrtc.NetworkConfig;
    mMediaConfig: awrtc.MediaConfig;

    mAddress: string;

    mDiv:HTMLElement;

    constructor( id, netConfig:awrtc.NetworkConfig, mediaConfig: awrtc.MediaConfig)
    {
        this.mId = id;
        this.mNetConfig = netConfig;
        this.mMediaConfig = mediaConfig;
    }

    public Start(address:string): void
    {   
        this.mDiv = document.createElement("div");
        document.body.appendChild(this.mDiv);
        this.mDiv.innerHTML += "<h1>Call " + this.mId + "</h1>";
        this.mAddress = address;
        this.mCall = new awrtc.BrowserWebRtcCall(this.mNetConfig);

    
        this.mCall.addEventListener((sender: any, args: awrtc.CallEventArgs) => {
            this.OnCallEvent(sender, args);
        });

        setInterval(() => {
            this.Update();
        }, 50);


        this.mCall.Configure(this.mMediaConfig);
    }

    private OnCallEvent(sender: any, args: awrtc.CallEventArgs)
    {
        
        if (args.Type == awrtc.CallEventType.ConfigurationComplete) {
            console.log("configuration complete");
            this.mCall.Listen(this.mAddress);
        }/* Old system. not used anymore
         else if (args.Type == awrtc.CallEventType.FrameUpdate) {

            let frameUpdateArgs = args as awrtc.FrameUpdateEventArgs;
            if (this.mLocalVideo == null && frameUpdateArgs.ConnectionId == awrtc.ConnectionId.INVALID) {
                this.mDiv.innerHTML += "local video: " + "<br>";
                console.log(this.mId  + ":local video added");
                let lazyFrame = frameUpdateArgs.Frame as awrtc.LazyFrame;
                this.mLocalVideo = lazyFrame.FrameGenerator.VideoElement;
                this.mDiv.appendChild(this.mLocalVideo);


            } else if (frameUpdateArgs.ConnectionId != awrtc.ConnectionId.INVALID && this.mRemoteVideo[frameUpdateArgs.ConnectionId.id] == null) {
                console.log(this.mId  + ":remote video added");
                let lazyFrame = frameUpdateArgs.Frame as awrtc.LazyFrame;
                this.mDiv.innerHTML += "remote " + this.mId + "<br>";
                this.mRemoteVideo[frameUpdateArgs.ConnectionId.id] = lazyFrame.FrameGenerator.VideoElement;
                this.mDiv.appendChild(this.mRemoteVideo[frameUpdateArgs.ConnectionId.id]);
            }
        }*/
        else if (args.Type == awrtc.CallEventType.MediaUpdate) {
            
            let margs = args as awrtc.MediaUpdatedEventArgs;
            if (this.mLocalVideo == null && margs.ConnectionId == awrtc.ConnectionId.INVALID) {

                var videoElement = margs.VideoElement;
                this.mLocalVideo = videoElement;
                this.mDiv.innerHTML += "local video: " + "<br>";
                this.mDiv.appendChild(videoElement);
                console.log("local video added resolution:" + videoElement.videoWidth  + videoElement.videoHeight + " fps: ??");

            }
            else if (margs.ConnectionId != awrtc.ConnectionId.INVALID && this.mRemoteVideo[margs.ConnectionId.id] == null) {
                
                var videoElement = margs.VideoElement;
                this.mRemoteVideo[margs.ConnectionId.id] = videoElement;
                this.mDiv.innerHTML += "remote " + this.mId + "<br>";
                this.mDiv.appendChild(videoElement);
                console.log("remote video added resolution:" + videoElement.videoWidth  + videoElement.videoHeight + " fps: ??");
            }
        }else if (args.Type == awrtc.CallEventType.ListeningFailed) {
            if (this.mNetConfig.IsConference == false) {

                //in 1 to 1 calls there is a listener and a caller
                //if we try to listen first and it fails it likely means
                //the other side is waiting for an incoming call
                this.mCall.Call(this.mAddress);
            } else {
                //in conference mode there is no "caller" as everyone
                //just joins a single call via Listen call. if it fails
                //there is likely a network fault / configuration error
                console.error(this.mId  + ":Listening failed. Server dead?");
            }
        } else if (args.Type == awrtc.CallEventType.ConnectionFailed) {
            alert(this.mId  + ":connection failed");
        } else if (args.Type == awrtc.CallEventType.CallEnded) {

            let callEndedEvent = args as awrtc.CallEndedEventArgs;
            console.log(this.mId  + ":call ended with id " + callEndedEvent.ConnectionId.id);
            //document.body.removeChild(mRemoteVideo[callEndedEvent.ConnectionId.id]);

            //remove properly
            this.mRemoteVideo[callEndedEvent.ConnectionId.id] = null;

        } else {

            console.log(args.Type);
        }


    }

    private Update(): void
    {
        this.mCall.Update();
    }

}

//Example that creates two calls within the same
//browser window and streams from one end to the
//other. 
export function BrowserWebRtcCall_minimal() {

    awrtc.BrowserMediaStream.sUseLazyFrames = true;
    let netConfig = new awrtc.NetworkConfig();
    netConfig.IsConference = false;
    netConfig.SignalingUrl = DefaultValues.Signaling;

    let mediaConfigSender = new awrtc.MediaConfig();
    mediaConfigSender.Video = true;
    mediaConfigSender.Audio = true;
    mediaConfigSender.FrameUpdates = false;
    let mediaConfigReceiver = new awrtc.MediaConfig();
    mediaConfigReceiver.Video = false;
    mediaConfigReceiver.Audio = false;
    mediaConfigReceiver.FrameUpdates = false;

    //random key so we don't mistakenly connect
    //to another user
    //replace with fixed passphrase to connect multiple browser windows
    var address = GetRandomKey();


    let numberOfCalls = 2;

    //creates a call that sends audio and video to the other side
    let sender = new MinimalCall(1, netConfig, mediaConfigSender);
    sender.Start(address);
    
    //will create a call that is just receiving
    let receiver = new MinimalCall(2, netConfig, mediaConfigReceiver);
    receiver.Start(address);




}

