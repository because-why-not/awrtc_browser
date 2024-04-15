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

import {ICall, NetworkConfig, ConnectionId,
    MediaConfig, BrowserWebRtcCall, CallEventType,
    DataMessageEventArgs, MessageEventArgs,
    CallAcceptedEventArgs, CallEventArgs, MediaUpdatedEventArgs } from "../awrtc/index";


export class CallTestHelper
{
    static CreateCall(video:boolean, audio: boolean) : ICall {

        var nconfig = new NetworkConfig();
        nconfig.SignalingUrl = "wss://s.y-not.app:443/test";
        
        var call = new BrowserWebRtcCall(nconfig);

        return call;
    }
    
}  

describe("CallTest", () => {
    var originalTimeout;

    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
    });
    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL =originalTimeout;
    });
    it("CallTest normal", () => {
        expect(true).toBe(true);
    });
    it("CallTest async", (done) => {
        setTimeout(()=>{
            
            expect(true).toBe(true);
            done();
        }, 1000);
    });

    it("Send test", (done) => {

        var call1 : ICall = null;
        var call2 : ICall = null;
        let call1ToCall2:ConnectionId;
        let call2ToCall1:ConnectionId;

        var address = "webunittest";

        var teststring1 = "teststring1";
        var teststring2 = "teststring2";
        var testdata1 = new Uint8Array([1, 2]);
        var testdata2 = new Uint8Array([3, 4]);
        

        call1 = CallTestHelper.CreateCall(false, false);
        expect(call1).not.toBeNull();
        call2 = CallTestHelper.CreateCall(false, false);
        expect(call2).not.toBeNull();
        expect(true).toBe(true);

        var mconfig = new MediaConfig();
        mconfig.Audio = false;
        mconfig.Video = false;


        call1.addEventListener((sender: any, args: CallEventArgs)=>{
            if(args.Type == CallEventType.ConfigurationComplete)
            {
                console.debug("call1 ConfigurationComplete");
                call2.Configure(mconfig);
            }else if(args.Type == CallEventType.WaitForIncomingCall)
            {
                console.debug("call1 WaitForIncomingCall");
                call2.Call(address);
            }else if(args.Type == CallEventType.CallAccepted)
            {
                let ar = args as CallAcceptedEventArgs;
                call1ToCall2 = ar.ConnectionId;
                //wait for message
            }else if(args.Type == CallEventType.Message)
            {
                console.debug("call1 Message");
                var margs = args as MessageEventArgs;
                expect(margs.Content).toBe(teststring1);
                expect(margs.Reliable).toBe(true);
                call1.Send(teststring2, false, call1ToCall2);

            }else if(args.Type == CallEventType.DataMessage)
            {
                console.debug("call1 DataMessage");
                var dargs = args as DataMessageEventArgs;
                expect(dargs.Reliable).toBe(true);

                var recdata = dargs.Content;
                expect(testdata1[0]).toBe(recdata[0]);
                expect(testdata1[1]).toBe(recdata[1]);

                console.debug("call1 send DataMessage");
                call1.SendData(testdata2, false, call1ToCall2)
            }else{

                console.error("unexpected event: " + args.Type);
                expect(true).toBe(false);
            }
        });
        call2.addEventListener((sender: any, args: CallEventArgs)=>{

            if(args.Type == CallEventType.ConfigurationComplete)
            {
                console.debug("call2 ConfigurationComplete");
                call1.Listen(address);
            }else if(args.Type == CallEventType.CallAccepted)
            {
                let ar = args as CallAcceptedEventArgs;
                call2ToCall1 = ar.ConnectionId;
                expect(call2ToCall1).toBeDefined();
                call2.Send(teststring1);
            }else if(args.Type == CallEventType.Message)
            {
                console.debug("call2 Message");
                var margs = args as MessageEventArgs;
                expect(margs.Content).toBe(teststring2);
                expect(margs.Reliable).toBe(false);
                console.debug("call2 send DataMessage " + call2ToCall1.id);
                call2.SendData(testdata1, true, call2ToCall1)
            }else if(args.Type == CallEventType.DataMessage)
            {
                console.debug("call2 DataMessage");
                var dargs = args as DataMessageEventArgs;
                expect(dargs.Reliable).toBe(false);

                var recdata = dargs.Content;
                expect(testdata2[0]).toBe(recdata[0]);
                expect(testdata2[1]).toBe(recdata[1]);
                done();

            }else{

                console.error("unexpected event: " + args.Type);
                expect(true).toBe(false);
            }
        });
        setInterval(()=>{
            call1.Update();
            call2.Update();
        }, 50);

        
        call1.Configure(mconfig);
    });

    
    it("Send test", (done) => {

        var call1 : ICall = null;
        var call2 : ICall = null;
        let call1ToCall2:ConnectionId;
        let call2ToCall1:ConnectionId;

        var address = "webunittest";

        var teststring1 = "teststring1";
        var teststring2 = "teststring2";
        var testdata1 = new Uint8Array([1, 2]);
        var testdata2 = new Uint8Array([3, 4]);
        

        call1 = CallTestHelper.CreateCall(false, false);
        expect(call1).not.toBeNull();
        call2 = CallTestHelper.CreateCall(false, false);
        expect(call2).not.toBeNull();
        expect(true).toBe(true);

        var mconfig = new MediaConfig();
        mconfig.Audio = false;
        mconfig.Video = false;

        call1.addEventListener((sender: any, args: CallEventArgs)=>{
            if(args.Type == CallEventType.ConfigurationComplete)
            {
                console.debug("call1 ConfigurationComplete");
                call2.Configure(mconfig);
            }else if(args.Type == CallEventType.WaitForIncomingCall)
            {
                console.debug("call1 WaitForIncomingCall");
                call2.Call(address);
            }else if(args.Type == CallEventType.CallAccepted)
            {
                let ar = args as CallAcceptedEventArgs;
                call1ToCall2 = ar.ConnectionId;
                //wait for message
            }else if(args.Type == CallEventType.Message)
            {
                console.debug("call1 Message");
                var margs = args as MessageEventArgs;
                expect(margs.Content).toBe(teststring1);
                expect(margs.Reliable).toBe(true);
                call1.Send(teststring2, false, call1ToCall2);

            }else if(args.Type == CallEventType.DataMessage)
            {
                console.debug("call1 DataMessage");
                var dargs = args as DataMessageEventArgs;
                expect(dargs.Reliable).toBe(true);

                var recdata = dargs.Content;
                expect(testdata1[0]).toBe(recdata[0]);
                expect(testdata1[1]).toBe(recdata[1]);

                console.debug("call1 send DataMessage");
                call1.SendData(testdata2, false, call1ToCall2)
            }else{

                console.error("unexpected event: " + args.Type);
                expect(true).toBe(false);
            }
        });
        call2.addEventListener((sender: any, args: CallEventArgs)=>{

            if(args.Type == CallEventType.ConfigurationComplete)
            {
                console.debug("call2 ConfigurationComplete");
                call1.Listen(address);
            }else if(args.Type == CallEventType.CallAccepted)
            {
                let ar = args as CallAcceptedEventArgs;
                call2ToCall1 = ar.ConnectionId;
                expect(call2ToCall1).toBeDefined();
                call2.Send(teststring1);
            }else if(args.Type == CallEventType.Message)
            {
                console.debug("call2 Message");
                var margs = args as MessageEventArgs;
                expect(margs.Content).toBe(teststring2);
                expect(margs.Reliable).toBe(false);
                console.debug("call2 send DataMessage " + call2ToCall1.id);
                call2.SendData(testdata1, true, call2ToCall1)
            }else if(args.Type == CallEventType.DataMessage)
            {
                console.debug("call2 DataMessage");
                var dargs = args as DataMessageEventArgs;
                expect(dargs.Reliable).toBe(false);

                var recdata = dargs.Content;
                expect(testdata2[0]).toBe(recdata[0]);
                expect(testdata2[1]).toBe(recdata[1]);
                done();

            }else{

                console.error("unexpected event: " + args.Type);
                expect(true).toBe(false);
            }
        });
        setInterval(()=>{
            call1.Update();
            call2.Update();
        }, 50);

        
        call1.Configure(mconfig);
    });

    it("Video frame receive test", (done) => {
        var call1: ICall = null;
        var call2: ICall = null;
        let call1ToCall2: ConnectionId;
        let call2ToCall1: ConnectionId;
    
        var address = "webunittest";
        var remoteFrameCount = 0;
        var localFrameCount = 0;
        var maxFrames = 10;
    
        call1 = CallTestHelper.CreateCall(false, false);
        expect(call1).not.toBeNull();
        call2 = CallTestHelper.CreateCall(false, false);
        expect(call2).not.toBeNull();
    
        var configSend = new MediaConfig();
        configSend.Audio = false;
        configSend.Video = true;
        configSend.FrameUpdates = true;

        var configRec = new MediaConfig();
        configRec.Audio = false;
        configRec.Video = false; 
        configRec.FrameUpdates = true;

        let localMediaUpdateReceived: MediaUpdatedEventArgs = null;
        let remoteMediaUpdateReceived: MediaUpdatedEventArgs = null;
    
        call1.addEventListener((sender: any, args: CallEventArgs) => {
            if (args.Type === CallEventType.ConfigurationComplete) {
                console.debug("call1 ConfigurationComplete");
                call2.Configure(configRec);
            } else if (args.Type === CallEventType.WaitForIncomingCall) {
                console.debug("call1 WaitForIncomingCall");
                call2.Call(address);
            } else if (args.Type === CallEventType.CallAccepted) {
                let ar = args as CallAcceptedEventArgs;
                call1ToCall2 = ar.ConnectionId;
            }else if (args.Type === CallEventType.FrameUpdate) {
                console.debug("call1 FrameUpdate");
                localFrameCount++;
            }else if (args.Type === CallEventType.MediaUpdate) {
                console.debug("call1 MediaUpdate");
                localMediaUpdateReceived = args as MediaUpdatedEventArgs;
                expect(localMediaUpdateReceived).toBeDefined();
                expect(localMediaUpdateReceived).not.toBeNull();
                expect(localMediaUpdateReceived.ConnectionId.id).toBe(ConnectionId.INVALID.id);
                expect(localMediaUpdateReceived.IsRemote).toBe(false);
                expect(localMediaUpdateReceived.VideoElement).toBeDefined();
                expect(localMediaUpdateReceived.VideoElement).not.toBeNull();
            }
        });
    
        call2.addEventListener((sender: any, args: CallEventArgs) => {
            if (args.Type === CallEventType.ConfigurationComplete) {
                console.debug("call2 ConfigurationComplete");
                call1.Listen(address);
            } else if (args.Type === CallEventType.CallAccepted) {
                let ar = args as CallAcceptedEventArgs;
                call2ToCall1 = ar.ConnectionId;
                expect(call2.HasAudioTrack(call2ToCall1)).toBeFalse();
                expect(call2.HasVideoTrack(call2ToCall1)).toBeTrue();
                console.debug("call2 CallAcceptedEventArgs");
            } else if (args.Type === CallEventType.MediaUpdate) {
                console.debug("call2 MediaUpdate");
                remoteMediaUpdateReceived = args as MediaUpdatedEventArgs;
                expect(remoteMediaUpdateReceived).toBeDefined();
                expect(remoteMediaUpdateReceived).not.toBeNull();
                expect(remoteMediaUpdateReceived.ConnectionId.id).toBe(call2ToCall1.id);
                expect(remoteMediaUpdateReceived.IsRemote).toBe(true);
                expect(remoteMediaUpdateReceived.VideoElement).toBeDefined();
                expect(remoteMediaUpdateReceived.VideoElement).not.toBeNull();
            }else if (args.Type === CallEventType.FrameUpdate) {
                console.debug("call2 FrameUpdate");
                remoteFrameCount++;
            }
            
            if (remoteFrameCount >= maxFrames) {
                expect(localFrameCount).toBeGreaterThanOrEqual(maxFrames);

                call1.Dispose();
                call2.Dispose();
                done();
            }
        });
    
        setInterval(() => {
            call1.Update();
            call2.Update();
        }, 50);
    
        call1.Configure(configSend);
    });

    /** Test starts with video off for both sides, connects two peers and
     * then turns on video.
     * 
     */
    it("CallReconfiguration_video_off_to_on", (done) => {
        
        let call1ToCall2: ConnectionId;
        let call2ToCall1: ConnectionId;
    
        var address = "webunittest";
        var frameCount = 0;
        var maxFrames = 10;
    
        var nconfig = new NetworkConfig();
        nconfig.SignalingUrl = "wss://s.y-not.app:443/test";
        nconfig.KeepSignalingAlive = true;
        
        var call1 = new BrowserWebRtcCall(nconfig);
        var call2 = new BrowserWebRtcCall(nconfig);
    
        var configSend = new MediaConfig();
        configSend.Audio = false;
        configSend.Video = false;
        configSend.FrameUpdates = true;

        var configRec = new MediaConfig();
        configRec.Audio = false;
        configRec.Video = false; 
        configRec.FrameUpdates = true;

        let mediaUpdateReceived: MediaUpdatedEventArgs = null;

        let phrase2;
        
        const call1Listener = (sender: any, args: CallEventArgs) => {
            if (args.Type === CallEventType.ConfigurationComplete) {
                console.debug("call1 ConfigurationComplete");
                call2.Configure(configRec);
            } else if (args.Type === CallEventType.WaitForIncomingCall) {
                console.debug("call1 WaitForIncomingCall");
                call2.Call(address);
            } else if (args.Type === CallEventType.CallAccepted) {
                let ar = args as CallAcceptedEventArgs;
                call1ToCall2 = ar.ConnectionId;
            }
        }
        call1.addEventListener(call1Listener);

        const call2Listener = (sender: any, args: CallEventArgs) => {
            if (args.Type === CallEventType.ConfigurationComplete) {
                console.debug("call2 ConfigurationComplete");
                call1.Listen(address);
            } else if (args.Type === CallEventType.CallAccepted) {
                let ar = args as CallAcceptedEventArgs;
                call2ToCall1 = ar.ConnectionId;
                expect(call2.HasAudioTrack(call2ToCall1)).toBeFalse();
                expect(call2.HasVideoTrack(call2ToCall1)).toBeFalse();
                console.debug("call2 CallAcceptedEventArgs");
                
                setTimeout(() => { 
                    phrase2();
                }, 500);

            } else if (args.Type === CallEventType.MediaUpdate) {
                console.debug("call2 MediaUpdate");
                mediaUpdateReceived = args as MediaUpdatedEventArgs;
                fail("MediaUpdate triggered without video");
            }else if (args.Type === CallEventType.FrameUpdate) {
                console.debug("call2 FrameUpdate");
                fail("FrameUpdate triggered without video");
            }
        }
        call2.addEventListener(call2Listener);


        //we trigger this once we successful established a call change the configuration
        phrase2 = () => { 

            let localFrameCount = 0;
            let remoteFrameCount = 0;
            call1.removeEventListener(call1Listener);
            call2.removeEventListener(call2Listener);
            

            const call1ListenerP2 = (sender: any, args: CallEventArgs) => {
                if (args.Type === CallEventType.ConfigurationComplete) {
                    console.debug("call1 ConfigurationComplete");
                } else if (args.Type === CallEventType.FrameUpdate) {
                    console.debug("call1 FrameUpdate");
                    localFrameCount++;
                }            
            }
            call1.addEventListener(call1ListenerP2);
    
            const call2ListenerP2 = (sender: any, args: CallEventArgs) => {
                if (args.Type === CallEventType.ConfigurationComplete) {
                    console.debug("call2 ConfigurationComplete");
                    call1.Listen(address);
                } else if (args.Type === CallEventType.MediaUpdate) {
                    console.debug("call2 MediaUpdate");
                    
                    const remoteMediaUpdateReceived = args as MediaUpdatedEventArgs;
                    expect(remoteMediaUpdateReceived).toBeDefined();
                    expect(remoteMediaUpdateReceived).not.toBeNull();
                    expect(remoteMediaUpdateReceived.ConnectionId.id).toBe(call2ToCall1.id);
                    expect(remoteMediaUpdateReceived.IsRemote).toBe(true);
                    expect(remoteMediaUpdateReceived.VideoElement).toBeDefined();
                    expect(remoteMediaUpdateReceived.VideoElement).not.toBeNull();
                }else if (args.Type === CallEventType.FrameUpdate) {
                    console.debug("call2 FrameUpdate");
                    remoteFrameCount++;
                    
                    if (remoteFrameCount >= maxFrames) {
                        expect(localFrameCount).toBeGreaterThanOrEqual(maxFrames);

                        call1.Dispose();
                        call2.Dispose();
                        done();
                    }
                }
            }
            call2.addEventListener(call2ListenerP2);

            configSend.Video = true;
            call1.Configure(configSend);

        };
    
        setInterval(() => {
            call1.Update();
            call2.Update();
        }, 50);
    
        call1.Configure(configSend);
    });
        
    /**
     * Same as above but with audio enabled. This means the MediaStream already exists when video turns on
     * and the track must be added later.
     */
    it("CallReconfiguration_audio_on_video_off_to_on", (done) => {
        
        let call1ToCall2: ConnectionId;
        let call2ToCall1: ConnectionId;
    
        var address = "webunittest";
        var frameCount = 0;
        var maxFrames = 10;
    
        var nconfig = new NetworkConfig();
        nconfig.SignalingUrl = "wss://s.y-not.app:443/test";
        nconfig.KeepSignalingAlive = true;
        
        var call1 = new BrowserWebRtcCall(nconfig);
        var call2 = new BrowserWebRtcCall(nconfig);
    
        var configSend = new MediaConfig();
        configSend.Audio = true;
        configSend.Video = false;
        configSend.FrameUpdates = false;

        var configRec = new MediaConfig();
        configRec.Audio = false;
        configRec.Video = false; 
        configRec.FrameUpdates = true;

        let mediaUpdateReceived: MediaUpdatedEventArgs = null;

        let phrase2;
        
        let call1Listener = (sender: any, args: CallEventArgs) => {
            if (args.Type === CallEventType.ConfigurationComplete) {
                console.debug("call1 ConfigurationComplete");
                call2.Configure(configRec);
            } else if (args.Type === CallEventType.WaitForIncomingCall) {
                console.debug("call1 WaitForIncomingCall");
                call2.Call(address);
            } else if (args.Type === CallEventType.CallAccepted) {
                let ar = args as CallAcceptedEventArgs;
                call1ToCall2 = ar.ConnectionId;
            }
        }
        call1.addEventListener(call1Listener);

        let call2Listener = (sender: any, args: CallEventArgs) => {
            if (args.Type === CallEventType.ConfigurationComplete) {
                console.debug("call2 ConfigurationComplete");
                call1.Listen(address);
            } else if (args.Type === CallEventType.CallAccepted) {
                let ar = args as CallAcceptedEventArgs;
                call2ToCall1 = ar.ConnectionId;
                expect(call2.HasAudioTrack(call2ToCall1)).toBeTrue();
                expect(call2.HasVideoTrack(call2ToCall1)).toBeFalse();
                console.debug("call2 CallAcceptedEventArgs");
                
                setTimeout(() => { 
                    phrase2();
                }, 500);

            } else if (args.Type === CallEventType.MediaUpdate) {
                console.debug("call2 MediaUpdate");
                mediaUpdateReceived = args as MediaUpdatedEventArgs;
                expect(mediaUpdateReceived.VideoElement).not.toBeNull();
                //TODO: check if we have audio but not video active
                //typings missing?
                //mediaUpdateReceived.VideoElement.audioTracks
            }else if (args.Type === CallEventType.FrameUpdate) {
                console.debug("call2 FrameUpdate");
                fail("FrameUpdate triggered without video");
            }
        }
        call2.addEventListener(call2Listener);


        //we trigger this once we successful established a call change the configuration
        phrase2 = () => { 

            let localFrameCount = 0;
            let remoteFrameCount = 0;
            call1.removeEventListener(call1Listener);
            call2.removeEventListener(call2Listener);
            

            const call1ListenerP2 = (sender: any, args: CallEventArgs) => {
                if (args.Type === CallEventType.ConfigurationComplete) {
                    console.debug("call1 ConfigurationComplete");
                } else if (args.Type === CallEventType.FrameUpdate) {
                    console.debug("call1 FrameUpdate");
                    localFrameCount++;
                }            
            }
            call1.addEventListener(call1ListenerP2);
    
            const call2ListenerP2 = (sender: any, args: CallEventArgs) => {
                if (args.Type === CallEventType.ConfigurationComplete) {
                    console.debug("call2 ConfigurationComplete");
                    call1.Listen(address);
                } else if (args.Type === CallEventType.MediaUpdate) {
                    console.debug("call2 MediaUpdate");
                    
                    const remoteMediaUpdateReceived = args as MediaUpdatedEventArgs;
                    expect(remoteMediaUpdateReceived).toBeDefined();
                    expect(remoteMediaUpdateReceived).not.toBeNull();
                    expect(remoteMediaUpdateReceived.ConnectionId.id).toBe(call2ToCall1.id);
                    expect(remoteMediaUpdateReceived.IsRemote).toBe(true);
                    expect(remoteMediaUpdateReceived.VideoElement).toBeDefined();
                    expect(remoteMediaUpdateReceived.VideoElement).not.toBeNull();
                }else if (args.Type === CallEventType.FrameUpdate) {
                    console.debug("call2 FrameUpdate");
                    remoteFrameCount++;
                    
                    if (remoteFrameCount >= maxFrames) {
                        //expect(localFrameCount).toBeGreaterThanOrEqual(maxFrames);

                        call1.Dispose();
                        call2.Dispose();
                        done();
                    }
                }
            }
            call2.addEventListener(call2ListenerP2);

            configSend.Video = true;
            call1.Configure(configSend);

        };
    
        setInterval(() => {
            call1.Update();
            call2.Update();
        }, 50);
    
        call1.Configure(configSend);
    });
});