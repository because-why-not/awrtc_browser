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
import { BrowserMediaNetwork, NetworkConfig, MediaConfig,
     ConnectionId, MediaEvent, MediaEventType,
      MediaConfigurationState, NetEventType, BrowserMediaStream } from "../awrtc/index";


export class MediaNetworkTest{

    createdNetworks:Array<BrowserMediaNetwork> = [];
    createDefault() : BrowserMediaNetwork
    {
        let netConfig = new NetworkConfig();
        netConfig.SignalingUrl = null;


        let createdNetwork = new BrowserMediaNetwork(netConfig);
        this.createdNetworks.push(createdNetwork);
        return createdNetwork;
    }

    

    public setup(): void {

        beforeEach(() => {
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
        })
        afterEach(() => {
            for(let net of this.createdNetworks)
                net.Dispose();
            this.createdNetworks = new Array<BrowserMediaNetwork>();
        })
        it("FrameUpdates", (done) => {
            let mediaConfig = new MediaConfig();
            let network = this.createDefault();
            network.Configure(mediaConfig);
            setInterval(()=>{
                network.Update();
                let localFrame = network.TryGetFrame(ConnectionId.INVALID);
                if(localFrame != null)
                {
                    expect(localFrame.Height).toBeGreaterThan(0);
                    expect(localFrame.Width).toBeGreaterThan(0);
                    expect(localFrame.Buffer).not.toBeNull();
                    done();
                }
                network.Flush();
            }, 10);

        });

        it("MediaEventLocal", (done) => {
            BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;

            let mediaConfig = new MediaConfig();
            let network = this.createDefault();
            network.Configure(mediaConfig);

            setInterval(()=>{
                network.Update();
                let evt : MediaEvent = null;
                while((evt = network.DequeueMediaEvent()) != null)
                {
                    console.log("Stream added",evt );
                    expect(evt.EventType).toBe(MediaEventType.StreamAdded);
                    expect(evt.Args.videoHeight).toBeGreaterThan(0);
                    expect(evt.Args.videoWidth).toBeGreaterThan(0);
                    done();
                }
                network.Flush();
            }, 10);

        });


        it("MediaEventRemote", (done) => {
            BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
            let testaddress = "testaddress" + Math.random();
            let sender = this.createDefault();
            let receiver = this.createDefault();

            let configureComplete = false;
            let senderFrame = false;
            let receiverFrame = false;

            sender.Configure(new MediaConfig());
            setInterval(()=>{
                sender.Update();
                receiver.Update();

                if(configureComplete == false)
                {
                    let state = sender.GetConfigurationState();
                    if(state == MediaConfigurationState.Successful)
                    {
                        configureComplete = true;
                        sender.StartServer(testaddress);
                    }else if(state == MediaConfigurationState.Failed)
                    {
                        fail();
                    }
                }

                let sndEvt = sender.Dequeue();
                if(sndEvt != null)
                {
                    console.log("sender event: " + sndEvt);
                    if(sndEvt.Type == NetEventType.ServerInitialized)
                    {
                        receiver.Connect(testaddress);
                    }
                }
                let recEvt = receiver.Dequeue();
                if(recEvt != null)
                {
                    console.log("receiver event: " + recEvt);
                }
                


                let evt : MediaEvent = null;

                while((evt = sender.DequeueMediaEvent()) != null)
                {
                    expect(evt.EventType).toBe(MediaEventType.StreamAdded);
                    expect(evt.Args.videoHeight).toBeGreaterThan(0);
                    expect(evt.Args.videoWidth).toBeGreaterThan(0);
                    senderFrame = true;
                    console.log("sender received first frame");
                }
                while((evt = receiver.DequeueMediaEvent()) != null)
                {
                    expect(evt.EventType).toBe(MediaEventType.StreamAdded);
                    expect(evt.Args.videoHeight).toBeGreaterThan(0);
                    expect(evt.Args.videoWidth).toBeGreaterThan(0);
                    receiverFrame = true;
                    console.log("receiver received first frame");
                }
                sender.Flush();
                receiver.Flush();

                if(senderFrame && receiverFrame)
                    done();
            }, 40);

        }, 15000);
    }
}


describe("MediaNetworkTest", () => {
    it("TestEnvironment", () => {
        expect(null).toBeNull();
    });

    var test = new MediaNetworkTest();
    test.setup();
});
