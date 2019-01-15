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
import { NetworkEvent, WebsocketNetwork, NetEventType, 
    WebsocketConnectionStatus, ConnectionId, IBasicNetwork } 
    from "../awrtc/index";
import { IBasicNetworkTest } from "helper/IBasicNetworkTest";



export class WebsocketTest extends IBasicNetworkTest {

    //replace with valid url that has a server behind it
    //public static sUrl = 'ws://localhost:12776/test';
    //public static sUrlShared = 'ws://localhost:12776/testshared';
    public static sUrl = 'ws://signaling.because-why-not.com';
    public static sUrlShared = 'ws://signaling.because-why-not.com/testshared';
    //any url to simulate offline server
    public static sBadUrl = 'ws://localhost:13776';

    private mUrl;

    public setup(): void {
        super.setup();
        //special tests

        beforeEach(() => {
            this.mUrl = WebsocketTest.sUrl;
        });

        it("SharedAddress", (done) => {
            this.mUrl = WebsocketTest.sUrlShared;

            var sharedAddress = "sharedtestaddress";
            var evt: NetworkEvent;
            var net1: WebsocketNetwork;
            var net2: WebsocketNetwork;


            this.thenAsync((finished) => {
                net1 = this._CreateNetwork() as WebsocketNetwork;
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

        it("BadUrlStartServer", (done) => {

            this.mUrl = WebsocketTest.sBadUrl;
            var evt: NetworkEvent;
            var srv: WebsocketNetwork;

            this.thenAsync((finished) => {
                srv = this._CreateNetwork() as WebsocketNetwork;
                expect(srv.getStatus()).toBe(WebsocketConnectionStatus.NotConnected);
                srv.StartServer();
                expect(srv.getStatus()).toBe(WebsocketConnectionStatus.Connecting);
                this.waitForEvent(srv, finished);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitFailed);
                expect(srv.getStatus()).toBe(WebsocketConnectionStatus.NotConnected);
                done();
            });
            this.start();
        });

        it("BadUrlConnect", (done) => {

            this.mUrl = WebsocketTest.sBadUrl;

            var evt: NetworkEvent;
            var clt: WebsocketNetwork;
            var cltId: ConnectionId;

            this.thenAsync((finished) => {
                clt = this._CreateNetwork() as WebsocketNetwork;
                expect(clt.getStatus()).toBe(WebsocketConnectionStatus.NotConnected);
                cltId = clt.Connect("invalid address");
                expect(clt.getStatus()).toBe(WebsocketConnectionStatus.Connecting);
                this.waitForEvent(clt, finished);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(clt.getStatus()).toBe(WebsocketConnectionStatus.NotConnected);
                done();
            });
            this.start();
        });


        it("WebsocketState", (done) => {
            var srv: WebsocketNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: WebsocketNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv as WebsocketNetwork;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt as WebsocketNetwork;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });

            this.thenAsync((finished) => {

                //both should be connected
                expect(srv.getStatus()).toBe(WebsocketConnectionStatus.Connected);
                expect(clt.getStatus()).toBe(WebsocketConnectionStatus.Connected);


                srv.Disconnect(srvToCltId);
                this.waitForEvent(srv, finished);
            });


            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);

                this.waitForEvent(clt, finished);
            });
            this.thenAsync((finished) => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);

                //after disconnect the client doesn't have any active connections -> expect disconnected
                expect(srv.getStatus()).toBe(WebsocketConnectionStatus.Connected);
                expect(clt.getStatus()).toBe(WebsocketConnectionStatus.NotConnected);

                srv.StopServer();
                this.waitForEvent(srv, finished);
            });

            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerClosed);
                expect(srv.getStatus()).toBe(WebsocketConnectionStatus.NotConnected);

                srv.StartServer(address);
                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {

                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);

                this._Connect(srv, address, clt, (srvToCltIdOut, cltToSrvIdOut) => {
                    finished();
                });
            });
            this.then(() => {

                done();
            });
            this.start();

        });
    }

    public _CreateNetworkImpl(): IBasicNetwork {
        //let url = 'ws://because-why-not.com:12776';
        return new WebsocketNetwork(this.mUrl);
    }
}






describe("WebsocketNetworkTest", () => {
    it("TestEnvironment", () => {
        expect(null).toBeNull();
    });

    beforeEach(() => {


    });

    var test = new WebsocketTest();
    test.setup();
});


