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
import { WebsocketTest } from "WebsocketNetworkTest";
import { IBasicNetworkTest } from "helper/IBasicNetworkTest";
import { NetworkEvent, IBasicNetwork, NetEventType, WebsocketNetwork,
    ConnectionId, LocalNetwork, WebRtcNetwork, IWebRtcNetwork, NetworkConfig } 
    from "../awrtc/index";

export class WebRtcNetworkTest extends IBasicNetworkTest {


    public static sUrl = 'ws://localhost:12776/test';
    public static sUrlShared = 'ws://localhost:12776/testshared';

    public static sDefaultIceServer = { urls: ["stun:stun.l.google.com:19302"] } as RTCIceServer;

    private mUrl = WebsocketTest.sUrl;

    //allows each test to overwrite the default behaviour
    private mUseWebsockets = false;

    //will set use websocket flag for each test
    public static mAlwaysUseWebsockets = false;


    public setup(): void {

        beforeEach(() => {
            this.mUrl = WebsocketTest.sUrl;
            this.mUseWebsockets = WebRtcNetworkTest.mAlwaysUseWebsockets;
        })

        it("GetBufferedAmount", (done) => {

            var srv: IWebRtcNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IWebRtcNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;



            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv as IWebRtcNetwork;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt as IWebRtcNetwork;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.then(() => {
                //TODO: more detailed testing by actually triggering the buffer to fill?
                //might be tricky as this is very system dependent
                let buf:number;
                buf = srv.GetBufferedAmount(srvToCltId, false);
                expect(buf).toBe(0);
                buf = srv.GetBufferedAmount(srvToCltId, true);
                expect(buf).toBe(0);
                buf = clt.GetBufferedAmount(cltToSrvId, false);
                expect(buf).toBe(0);
                buf = clt.GetBufferedAmount(cltToSrvId, true);
                expect(buf).toBe(0);
                done();
            });
            
            this.start();
        });
        
        it("SharedAddress", (done) => {

            //turn off websockets and use shared websockets for this test as local network doesn't support shared mode
            this.mUseWebsockets = true;
            this.mUrl = WebsocketTest.sUrlShared;

            var sharedAddress = "sharedtestaddress";
            var evt: NetworkEvent;
            var net1: IBasicNetwork;
            var net2: IBasicNetwork;


            this.thenAsync((finished) => {
                net1 = this._CreateNetwork();
                net1.StartServer(sharedAddress);
                this.waitForEvent(net1, finished);
            });

            this.thenAsync((finished) => {
                evt = net1.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);


                net2 = this._CreateNetwork() as WebsocketNetwork;
                net2.StartServer(sharedAddress);
                this.waitForEvent(net2, finished);
            });

            this.thenAsync((finished) => {
                evt = net2.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);


                this.waitForEvent(net1, finished);
            });

            this.thenAsync((finished) => {
                evt = net1.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.NewConnection);


                this.waitForEvent(net2, finished);
            });

            this.then(() => {
                evt = net2.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.NewConnection);

                done();
            });

            this.start();
        });

        //connect using only direct local connections (give no ice servers)
        it("ConnectLocalOnly", (done) => {

            var srv: IBasicNetwork;
            var address: string;
            var clt: IBasicNetwork;
            var cltId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                srv = this._CreateNetwork();
                this._CreateServerNetwork((rsrv, raddress) => {
                    srv = rsrv;
                    address = raddress;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                clt = this._CreateNetwork();
                cltId = clt.Connect(address);
                this.waitForEvent(clt, finished);
            });

            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.NewConnection);
                expect(evt.ConnectionId.id).toBe(cltId.id);
            });

            this.thenAsync((finished) => {
                this.waitForEvent(srv, finished);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.NewConnection);
                expect(evt.ConnectionId.id).not.toBe(ConnectionId.INVALID.id);
                done();
            });
            this.start();
        });

        super.setup();
        //special tests
    }

    public _CreateNetworkImpl(): IBasicNetwork {

        const config = new NetworkConfig();
        config.IceServers = [WebRtcNetworkTest.sDefaultIceServer];
        

        if (this.mUseWebsockets) {
            config.SignalingUrl = this.mUrl
        }
        else {
            config.SignalingUrl = null;
        }
        return new WebRtcNetwork(config);
    }

}


describe("WebRtcNetworkTest", () => {
    it("TestEnvironment", () => {
        expect(null).toBeNull();
    });

    var test = new WebRtcNetworkTest();
    test.mDefaultWaitTimeout = 5000;
    test.setup();
});
