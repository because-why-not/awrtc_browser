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
import { BasicNetworkTestBase, Task } from "./BasicNetworkTestBase";
import { IBasicNetwork, NetworkEvent, NetEventType, ConnectionId, Encoding, SLog, SLogLevel } from "../../awrtc/network/index";

export abstract class IBasicNetworkTest extends BasicNetworkTestBase {

    public setup(): void {
        super.setup();
        let originalTimeout = 5000;
        beforeEach(() => {
            SLog.RequestLogLevel(SLogLevel.Info);
            originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
            jasmine.DEFAULT_TIMEOUT_INTERVAL = this.mDefaultWaitTimeout + 5000;
        });
        afterEach(() => {
            console.debug("Test shutting down ...");
            this.ShutdownAll();
            originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
            jasmine.DEFAULT_TIMEOUT_INTERVAL = this.mDefaultWaitTimeout + 5000;
        });


        //add all reusable tests here
        //TODO: check how to find the correct line where it failed
        it("TestEnvironmentAsync", (done) => {

            let value1 = false;
            let value2 = false;

            this.then(() => {
                expect(value1).toBe(false);
                expect(value2).toBe(false);
                value1 = true;
            });
            this.thenAsync((finished: Task) => {

                expect(value1).toBe(true);
                expect(value2).toBe(false);
                value2 = true;
                finished();
            });
            this.then(() => {
                expect(value1).toBe(true);
                expect(value2).toBe(true);
                done();
            });
            this.start();

        });
        it("Create", () => {

            let clt: IBasicNetwork;

            clt = this._CreateNetwork();
            expect(clt).not.toBe(null);
        });

        it("StartServer", (done) => {

            var evt: NetworkEvent;
            var srv: IBasicNetwork;

            this.thenAsync((finished) => {
                srv = this._CreateNetwork();
                srv.StartServer();
                this.waitForEvent(srv, finished);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);
                expect(evt.ConnectionId.id).toBe(ConnectionId.INVALID.id);
                expect(evt.Info).not.toBe(null);
                done();
            });
            this.start();
        });

        it("StartServerNamed", (done) => {

            var name = "StartServerNamedTest";
            var evt: NetworkEvent;
            var srv1: IBasicNetwork;
            var srv2: IBasicNetwork;

            srv1 = this._CreateNetwork();
            srv2 = this._CreateNetwork();

            this.thenAsync((finished) => {
                srv1.StartServer(name);
                this.waitForEvent(srv1, finished);
            });
            this.then(() => {
                evt = srv1.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);
                expect(evt.ConnectionId.id).toBe(ConnectionId.INVALID.id);
                expect(evt.Info).toBe(name);
            });
            this.thenAsync((finished) => {
                srv2.StartServer(name);
                this.waitForEvent(srv2, finished);
            });
            this.thenAsync((finished) => {
                //expect the server start to fail because the address is in use
                evt = srv2.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitFailed);
                expect(evt.ConnectionId.id).toBe(ConnectionId.INVALID.id);
                expect(evt.Info).toBe(name);

                //stop the other server to free the address
                srv1.StopServer();
                this.waitForEvent(srv1, finished);
            });
            this.thenAsync((finished) => {
                //expect the server start to fail because the address is in use
                evt = srv1.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerClosed);
                expect(evt.ConnectionId.id).toBe(ConnectionId.INVALID.id);

                //stop the other server to free the address
                srv2.StartServer(name);
                this.waitForEvent(srv2, finished);
            });
            this.thenAsync((finished) => {
                //expect the server start to fail because the address is in use
                evt = srv2.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);
                done();
            });
            this.start();
        });


        it("StopServer", (done) => {

            var evt: NetworkEvent;
            var srv: IBasicNetwork;

            this.thenAsync((finished) => {
                srv = this._CreateNetwork();
                srv.StopServer();
                this.waitForEvent(srv, finished, 100);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).toBeNull();
                done();
            });
            this.start();
        });

        it("StopServer2", (done) => {

            var evt: NetworkEvent;
            var srv: IBasicNetwork;

            this.thenAsync((finished) => {
                srv = this._CreateNetwork();
                srv.StartServer();
                this.waitForEvent(srv, finished);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerInitialized);
                expect(evt.ConnectionId.id).toBe(ConnectionId.INVALID.id);
                expect(evt.Info).not.toBe(null);
            });
            this.thenAsync((finished) => {
                srv.StopServer();
                this.waitForEvent(srv, finished);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerClosed);
                expect(evt.ConnectionId.id).toBe(ConnectionId.INVALID.id);
                //enforce address in this to prepare having multiple addresses?
                //expect(evt.Info).not.toBe(null);

                done();
            });
            this.start();
        });


        it("_CreateServerNetwork", (done) => {

            var srv: IBasicNetwork;
            var address: string;

            this.thenAsync((finished) => {
                this._CreateServerNetwork((rsrv, raddress) => {
                    srv = rsrv;
                    address = raddress;
                    finished();
                });
            });
            this.then(() => {
                expect(srv).not.toBeNull();
                expect(address).not.toBeNull();
                done();
            });
            this.start();
        });

        it("ConnectFail", (done) => {

            var evt: NetworkEvent;
            var clt: IBasicNetwork;
            var cltId: ConnectionId;

            this.thenAsync((finished) => {
                clt = this._CreateNetwork();
                cltId = clt.Connect("invalid address");
                this.waitForEvent(clt, finished);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId.id);
                done();
            });
            this.start();
        });



        it("ConnectTwo", (done) => {

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

        it("ConnectHelper", (done) => {

            var srv: IBasicNetwork;
            var address: string;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var srvToCltId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv: IBasicNetwork, raddress: string, rsrvToCltId: ConnectionId, rclt: IBasicNetwork, rcltToSrvId: ConnectionId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    done();
                });
            });
            this.start();
        });

        it("Peek", (done) => {
            var evt: NetworkEvent;
            var net = this._CreateNetwork();

            var cltId1 = net.Connect("invalid address1");
            var cltId2 = net.Connect("invalid address2");
            var cltId3 = net.Connect("invalid address3");

            this.thenAsync((finished) => {
                this.waitForEvent(net, finished);
            });
            this.thenAsync((finished) => {
                evt = net.Peek();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId1.id);
                evt = net.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId1.id);
                this.waitForEvent(net, finished);
            });

            this.thenAsync((finished) => {
                evt = net.Peek();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId2.id);
                evt = net.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId2.id);
                this.waitForEvent(net, finished);
            });
            this.thenAsync((finished) => {
                evt = net.Peek();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId3.id);
                evt = net.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ConnectionFailed);
                expect(evt.ConnectionId.id).toBe(cltId3.id);
                done();
            });
            this.start();
        });

        it("Disconnect", (done) => {
            var evt: NetworkEvent;
            var clt = this._CreateNetwork();

            this.thenAsync((finished) => {

                clt.Disconnect(ConnectionId.INVALID);
                this.waitForEvent(clt, finished, 100);
            });
            this.thenAsync((finished) => {
                evt = clt.Dequeue();
                expect(evt).toBeNull();

                clt.Disconnect(new ConnectionId(1234));
                this.waitForEvent(clt, finished, 100);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).toBeNull();
                done();
            });
            this.start();
        });


        it("DisconnectClient", (done) => {
            var srv: IBasicNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });

            this.thenAsync((finished) => {
                clt.Disconnect(cltToSrvId);
                this.waitForEvent(clt, finished);
            });

            this.thenAsync((finished) => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);
                this.waitForEvent(srv, finished);
            });
            this.then(() => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(srvToCltId.id).toBe(evt.ConnectionId.id);
                done();
            });
            this.start();
        });


        it("DisconnectServer", (done) => {
            var srv: IBasicNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });

            this.thenAsync((finished) => {
                srv.Disconnect(srvToCltId);
                this.waitForEvent(srv, finished);
            });


            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(srvToCltId.id).toBe(evt.ConnectionId.id);
                this.waitForEvent(clt, finished);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);
                done();
            });
            this.start();
        });
        it("DisconnectServerMulti", (done) => {
            var srv: IBasicNetwork;
            var address: string;
            var srvToClt1Id: ConnectionId;
            var srvToClt2Id: ConnectionId;
            var clt1: IBasicNetwork;
            var clt1ToSrvId: ConnectionId;
            var clt2: IBasicNetwork;
            var clt2ToSrvId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToClt1Id = rsrvToCltId;
                    clt1 = rclt;
                    clt1ToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                clt2 = this._CreateNetwork();
                this._Connect(srv, address, clt2, (rsrvToCltId, rcltToSrvId) => {
                    srvToClt2Id = rsrvToCltId;
                    clt2ToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                srv.Disconnect(srvToClt1Id);
                srv.Disconnect(srvToClt2Id);
                this.waitForEvent(srv, finished);
            });


            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(srvToClt1Id.id).toBe(evt.ConnectionId.id);
                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(srvToClt2Id.id).toBe(evt.ConnectionId.id);
                this.waitForEvent(clt1, finished);
            });
            this.thenAsync((finished) => {
                evt = clt1.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(clt1ToSrvId.id).toBe(evt.ConnectionId.id);
                this.waitForEvent(clt2, finished);
            });
            this.then(() => {
                evt = clt2.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(clt2ToSrvId.id).toBe(evt.ConnectionId.id);
                done();
            });
            this.start();
        });

        it("ShutdownEmpty", (done) => {
            var net: IBasicNetwork;
            var evt: NetworkEvent;

            net = this._CreateNetwork();

            this.thenAsync((finished) => {
                net.Shutdown();
                this.waitForEvent(net, finished);
            });
            this.then(() => {
                evt = net.Dequeue();
                expect(evt).toBeNull();
                done();
            });
            this.start();
        });

        it("ShutdownServer", (done) => {

            var srv: IBasicNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                srv.Shutdown();
                this.waitForEvent(clt, finished);
            });
            this.thenAsync((finished) => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);

                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(srvToCltId.id).toBe(evt.ConnectionId.id);

                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ServerClosed);
                expect(evt.ConnectionId).toBe(ConnectionId.INVALID);

                this.waitForEvent(srv, finished, 100);
            });
            this.then(() => {

                //no further events are suppose to be triggered after shutdown
                evt = srv.Dequeue();
                expect(evt).toBeNull();

                done();
            });
            this.start();
        });


        it("ShutdownClient", (done) => {

            var srv: IBasicNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                clt.Shutdown();
                this.waitForEvent(clt, finished);
            });
            this.thenAsync((finished) => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);

                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {
                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.Disconnected);
                expect(srvToCltId.id).toBe(evt.ConnectionId.id);

                this.waitForEvent(srv, finished, 100);
            });
            this.then(() => {

                evt = srv.Dequeue();
                expect(evt).toBeNull();

                done();
            });
            this.start();
        });

        it("DisconnectInvalid", (done) => {
            var evt: NetworkEvent;
            var clt = this._CreateNetwork();
            clt.Disconnect(ConnectionId.INVALID);
            clt.Disconnect(new ConnectionId(1234));
            this.thenAsync((finished) => {
                this.waitForEvent(clt, finished, 100);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).toBeNull();
            });
            this.then(() => {
                done();
            });
            this.start();
        });

        it("SendDataTolerateInvalidDestination", (done) => {
            var evt: NetworkEvent;
            var clt = this._CreateNetwork();
            var testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

            this.thenAsync((finished) => {
                clt.SendData(ConnectionId.INVALID, testData, true);
                this.waitForEvent(clt, finished, 100);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).toBeNull();
            });

            this.thenAsync((finished) => {
                clt.SendData(ConnectionId.INVALID, testData, false);
                this.waitForEvent(clt, finished, 100);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).toBeNull();
            });
            this.then(() => {
                done();
            });
            this.start();
        });


        it("SendDataReliable", (done) => {

            var srv: IBasicNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            var testMessage: string = "SendDataReliable_testmessage1234";
            var testMessageBytes = Encoding.UTF16.GetBytes(testMessage);
            var receivedTestMessage: string;


            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                clt.SendData(cltToSrvId, testMessageBytes, true);
                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {

                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ReliableMessageReceived);
                expect(srvToCltId.id).toBe(evt.ConnectionId.id);
                receivedTestMessage = Encoding.UTF16.GetString(evt.MessageData);
                expect(receivedTestMessage).toBe(testMessage);


                srv.SendData(srvToCltId, testMessageBytes, true);
                this.waitForEvent(clt, finished);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.ReliableMessageReceived);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);
                receivedTestMessage = Encoding.UTF16.GetString(evt.MessageData);
                expect(receivedTestMessage).toBe(testMessage);
                done();
            });
            this.start();
        });


        it("SendDataUnreliable", (done) => {

            var srv: IBasicNetwork;
            var address: string;
            var srvToCltId: ConnectionId;
            var clt: IBasicNetwork;
            var cltToSrvId: ConnectionId;
            var evt: NetworkEvent;

            var testMessage: string = "SendDataUnreliable_testmessage1234";
            var testMessageBytes = Encoding.UTF16.GetBytes(testMessage);
            var receivedTestMessage: string;


            this.thenAsync((finished) => {
                this._CreateServerClient((rsrv, raddress, rsrvToCltId, rclt, rcltToSrvId) => {
                    srv = rsrv;
                    address = raddress;
                    srvToCltId = rsrvToCltId;
                    clt = rclt;
                    cltToSrvId = rcltToSrvId;
                    finished();
                });
            });
            this.thenAsync((finished) => {
                clt.SendData(cltToSrvId, testMessageBytes, false);
                this.waitForEvent(srv, finished);
            });
            this.thenAsync((finished) => {

                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.UnreliableMessageReceived);
                expect(srvToCltId.id).toBe(evt.ConnectionId.id);
                receivedTestMessage = Encoding.UTF16.GetString(evt.MessageData);
                expect(receivedTestMessage).toBe(testMessage);


                srv.SendData(srvToCltId, testMessageBytes, false);
                this.waitForEvent(clt, finished);
            });
            this.then(() => {
                evt = clt.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.UnreliableMessageReceived);
                expect(cltToSrvId.id).toBe(evt.ConnectionId.id);
                receivedTestMessage = Encoding.UTF16.GetString(evt.MessageData);
                expect(receivedTestMessage).toBe(testMessage);
                done();
            });
            this.start();
        });
    }
}
