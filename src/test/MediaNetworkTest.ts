/*
Copyright (c) 2022, because-why-not.com Limited
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
     ConnectionId,
      MediaConfigurationState, NetEventType, BrowserMediaStream, Media, SLog, SLogLevel, IFrameData, NetworkEvent, StreamAddedEvent } from "../awrtc/index";
import { RtcEventType, StatsEvent } from "../awrtc/network/IWebRtcNetwork";


class TestVideoSource
{
    public canvas: HTMLCanvasElement;
    public fps = 30;
    private color: string;
    private interval: number = null;
    public constructor(color: string)
    {
        this.color = color;
        let canvas = document.createElement("canvas");
        document.body.appendChild(canvas);  
        canvas.width = 8;
        canvas.height = 8;
        this.canvas = canvas;
        this.MakeFrame();
    }

    public MakeFrame(){
        let ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        //make blue for debugging purposes
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    //Auto refresh is needed because Chrome does not generate
    //frames if the canvas isn't actively used (even if a stream is set to capture 30 fps from it)
    public AutoRefresh() {
        this.interval = window.setInterval(() => {
            this.MakeFrame();

         }, 1 / this.fps);
    }

    public Stop() {
        if (this.interval != null) {
            
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
export class MediaNetworkTest{

    mVideoSourceBlue: TestVideoSource = null;
    mVideoSourceRed: TestVideoSource = null;

    mIntervals = [];
    createdNetworks:Array<BrowserMediaNetwork> = [];
    createDefault() : BrowserMediaNetwork
    {
        let netConfig = new NetworkConfig();
        netConfig.SignalingUrl = null;


        let createdNetwork = new BrowserMediaNetwork(netConfig);
        this.createdNetworks.push(createdNetwork);
        return createdNetwork;
    }

    testInterval(callback, ms): void{
        const id = setInterval(callback, ms);
        this.mIntervals.push(id);
    }


    public setup(): void {

        beforeEach(() => {
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000000;
            this.mVideoSourceBlue = new TestVideoSource("blue");
            this.mVideoSourceBlue.AutoRefresh();
            this.mVideoSourceRed = new TestVideoSource("red");
            this.mVideoSourceRed.AutoRefresh();
            this.mIntervals = [];

            Media.SharedInstance.VideoInput.AddCanvasDevice(this.mVideoSourceBlue.canvas, "blue", this.mVideoSourceBlue.canvas.width, this.mVideoSourceBlue.canvas.height, this.mVideoSourceBlue.fps);
            Media.SharedInstance.VideoInput.AddCanvasDevice(this.mVideoSourceRed.canvas, "red", this.mVideoSourceRed.canvas.width, this.mVideoSourceRed.canvas.height, this.mVideoSourceRed.fps);
            
        })

        afterEach(() => {
            //delete all existing networks
            for(let net of this.createdNetworks)
                net.Dispose();
            this.createdNetworks = new Array<BrowserMediaNetwork>();

            //clear all custom video devices
            Media.ResetSharedInstance();

            //stop intervals
            this.mIntervals.forEach(x => {
                clearInterval(x);
            });
            this.mIntervals = [];
            this.mVideoSourceBlue.Stop();
            this.mVideoSourceRed.Stop();
            
        })
        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        /*
        TODO: A single test that connects two peers with different settings and then performs
        renegotation to test any changes
        1. audio off, video off -> both on
        2. audio off, video off -> video on -> audio on
        3. audio off, video off -> audio on -> video on
        4. audio on, video on -> audio off
        5. audio on, video on -> video off
        6. audio on, video on -> audio off, video off
        7. change of video device
        */
        it("Reconfigure_Remote", async () => {
            BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
            SLog.SetLogLevel(SLogLevel.Info);


            let mediaConfig = new MediaConfig();
            mediaConfig.Video = true;
            mediaConfig.VideoDeviceName = "blue";

            let net1 = this.createDefault();
            net1.Configure(mediaConfig);

            let net2 = this.createDefault();
            

            while (net1.GetConfigurationState() === MediaConfigurationState.InProgress) {
                net1.Update();
                await sleep(10);
            }
            console.log("configure done");
            expect(net1.GetConfigurationState()).toBe(MediaConfigurationState.Successful);

            let localFrame: IFrameData= null;
            while (localFrame == null) {
                net1.Update();
                localFrame = net1.TryGetFrame(ConnectionId.INVALID);
                await sleep(10);
            }

            

            console.log("Frame received. Expecting blue:");
            expect(localFrame.Height).toBeGreaterThan(0);
            expect(localFrame.Width).toBeGreaterThan(0);
            expect(localFrame.Buffer).not.toBeNull();
            
            expect(localFrame.Buffer[0]).toBeLessThan(5);
            expect(localFrame.Buffer[1]).toBeLessThan(5);
            expect(localFrame.Buffer[2]).toBeGreaterThan(250);
            expect(localFrame.Buffer[3]).toBe(255);
            
            console.log("Reconfigure to red video source");
            mediaConfig.VideoDeviceName = "red";
            net1.Configure(mediaConfig);

            while (net1.GetConfigurationState() === MediaConfigurationState.InProgress) {
                net1.Update();
                await sleep(10);
            }
            console.log("configure done");
            expect(net1.GetConfigurationState()).toBe(MediaConfigurationState.Successful);

            
            localFrame= null;
            while (localFrame == null) {
                net1.Update();
                localFrame = net1.TryGetFrame(ConnectionId.INVALID);
                await sleep(10);
            }
            console.log("Frame received. Expecting red:");
            //expect red
            expect(localFrame.Buffer[0]).toBeGreaterThan(250);
            expect(localFrame.Buffer[1]).toBeLessThan(5);
            expect(localFrame.Buffer[2]).toBeLessThan(5);
            expect(localFrame.Buffer[3]).toBe(255);
            console.log("test done");

        });
        it("Reconfigure_Local", async () => {

            let mediaConfig = new MediaConfig();
            mediaConfig.Video = true;
            mediaConfig.VideoDeviceName = "blue";

            let network = this.createDefault();
            network.Configure(mediaConfig);

            while (network.GetConfigurationState() === MediaConfigurationState.InProgress) {
                network.Update();
                await sleep(10);
            }
            console.log("configure done");
            expect(network.GetConfigurationState()).toBe(MediaConfigurationState.Successful);

            let localFrame: IFrameData= null;
            while (localFrame == null) {
                network.Update();
                localFrame = network.TryGetFrame(ConnectionId.INVALID);
                await sleep(10);
            }

            console.log("Frame received. Expecting blue:");
            expect(localFrame.Height).toBeGreaterThan(0);
            expect(localFrame.Width).toBeGreaterThan(0);
            expect(localFrame.Buffer).not.toBeNull();
            
            expect(localFrame.Buffer[0]).toBeLessThan(5);
            expect(localFrame.Buffer[1]).toBeLessThan(5);
            expect(localFrame.Buffer[2]).toBeGreaterThan(250);
            expect(localFrame.Buffer[3]).toBe(255);
            
            console.log("Reconfigure to red video source");
            mediaConfig.VideoDeviceName = "red";
            network.Configure(mediaConfig);

            while (network.GetConfigurationState() === MediaConfigurationState.InProgress) {
                network.Update();
                await sleep(10);
            }
            console.log("configure done");
            expect(network.GetConfigurationState()).toBe(MediaConfigurationState.Successful);

            
            localFrame= null;
            while (localFrame == null) {
                network.Update();
                localFrame = network.TryGetFrame(ConnectionId.INVALID);
                await sleep(10);
            }
            console.log("Frame received. Expecting red:");
            //expect red
            expect(localFrame.Buffer[0]).toBeGreaterThan(250);
            expect(localFrame.Buffer[1]).toBeLessThan(5);
            expect(localFrame.Buffer[2]).toBeLessThan(5);
            expect(localFrame.Buffer[3]).toBe(255);
            console.log("test done");

        });



        it("FrameUpdates", (done) => {
            let mediaConfig = new MediaConfig();
            mediaConfig.Video = true;
            let network = this.createDefault();
            network.Configure(mediaConfig);
            this.testInterval(()=>{
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

        it("StreamAddedEventLocal", (done) => {
            BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;

            let mediaConfig = new MediaConfig();
            mediaConfig.Video = true;
            let network = this.createDefault();
            network.Configure(mediaConfig);

            this.testInterval(()=>{
                network.Update();
                let evt : StreamAddedEvent = null;
                while((evt = network.DequeueRtcEvent() as StreamAddedEvent) != null)
                {
                    console.log("Stream added",evt );
                    expect(evt.EventType).toBe(RtcEventType.StreamAdded);
                    expect(evt.Args.videoHeight).toBeGreaterThan(0);
                    expect(evt.Args.videoWidth).toBeGreaterThan(0);
                    done();
                }
                network.Flush();
            }, 10);

        });


        it("StreamAddedEventRemote", (done) => {
            BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
            let testaddress = "testaddress" + Math.random();
            let sender = this.createDefault();
            let receiver = this.createDefault();

            let configureComplete = false;
            let senderFrame = false;
            let receiverFrame = false;
            const config = new MediaConfig();
            config.Video = true;
            sender.Configure(config);
            this.testInterval(()=>{
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
                


                let evt : StreamAddedEvent = null;

                while((evt = sender.DequeueRtcEvent() as StreamAddedEvent) != null)
                {
                    expect(evt.EventType).toBe(RtcEventType.StreamAdded);
                    expect(evt.Args.videoHeight).toBeGreaterThan(0);
                    expect(evt.Args.videoWidth).toBeGreaterThan(0);
                    senderFrame = true;
                    console.log("sender received first frame");
                }
                while((evt = receiver.DequeueRtcEvent() as StreamAddedEvent) != null)
                {
                    expect(evt.EventType).toBe(RtcEventType.StreamAdded);
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

        
        it("get_stats", async () => {
            BrowserMediaStream.DEBUG_SHOW_ELEMENTS = true;
            SLog.SetLogLevel(SLogLevel.Info);


            let mediaConfig = new MediaConfig();
            mediaConfig.Video = true;
            mediaConfig.VideoDeviceName = "blue";

            let net1 = this.createDefault();
            net1.Configure(mediaConfig);

            let net2 = this.createDefault();
            

            while (net1.GetConfigurationState() === MediaConfigurationState.InProgress) {
                net1.Update();
                await sleep(10);
            }
            console.log("configure done");
            expect(net1.GetConfigurationState()).toBe(MediaConfigurationState.Successful);
            const address = "test" + Date.now();
            net1.StartServer(address);
            
            const sleeptime = 10;
            let waittime = 0;
            //fail if we didn't reach a successful test condition after this time
            const connectionTimeout = 5000;

            let net1_to_net2: ConnectionId = ConnectionId.INVALID;
            let net2_to_net1: ConnectionId = ConnectionId.INVALID;
            let stats_event: StatsEvent = null;

            let connected1 = false;
            let connected2 = false;
            //connect
            //let a few frames play and then request statistics
            while (waittime < connectionTimeout && !(connected1 && connected2))
            {
                net1.Update();
                net2.Update();

                let evt: NetworkEvent = null;
                while ((evt = net1.Dequeue()))
                {
                    if (evt.Type == NetEventType.ServerInitialized) {
                        net1_to_net2 = evt.ConnectionId;
                        net2_to_net1 = net2.Connect(address);
                    } if (evt.Type == NetEventType.NewConnection) {
                        connected1 = true;
                    }else {
                        //fail?
                    }
                }
                while ((evt = net2.Dequeue()))
                {
                    if (evt.Type == NetEventType.NewConnection) {
                        connected2 = true;
                    } else {
                        //fail?
                    }
                }
                //expect no stat events yet
                const evt1 = net1.DequeueRtcEvent();
                if (evt1)
                    expect(evt1.EventType).not.toBe(RtcEventType.Stats);
                const evt2 = net2.DequeueRtcEvent(); 
                if (evt2)
                    expect(evt2.EventType).not.toBe(RtcEventType.Stats);
                
                
                await sleep(sleeptime);
                waittime += sleeptime;
            }
            expect(waittime).withContext("Connection was not establish within timeout").toBeLessThan(connectionTimeout);

            const statsTimeout = 5000;
            waittime = 0;

            net1.RequestStats();
            while (waittime < statsTimeout)
            {
                net1.Update();
                net2.Update();
                
                //expect to receive a stats event within timeout
                const evt = net1.DequeueRtcEvent();
                if (evt != null && evt.EventType == RtcEventType.Stats) {
                    stats_event = evt as StatsEvent;
                    break;
                }

                await sleep(sleeptime);
                waittime += sleeptime;
            }
            expect(waittime).withContext("StatReports did not arrive within timeout").toBeLessThan(statsTimeout);
            expect(stats_event).withContext("Network 1 did not receive a stats event.").not.toBeNull();
            expect(stats_event.Reports.length).withContext("Network 1 did receive an event but it has no reports attached.").toBeGreaterThan(0);

        });
    }
}


describe("MediaNetworkTest", () => {
    it("TestEnvironment", () => {
        expect(null).toBeNull();
    });

    var test = new MediaNetworkTest();
    test.setup();
});
