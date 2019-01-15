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
import { IBasicNetwork, NetworkEvent, ConnectionId, NetEventType } 
    from "../../awrtc/network/index";


export interface Task {
    (): void;
}
export interface AsyncTask {
    (finished: Task): void;
}
export class TestTaskRunner {

    public _toDoList = new Array<AsyncTask>();

    public then(syncTask: Task) {

        var wrap = (finished: Task) => {
            syncTask();
            finished();
        };
        this._toDoList.push(wrap);
    }
    public thenAsync(task: AsyncTask) {

        this._toDoList.push(task);
    }

    public start() {

        var task = this._toDoList.shift();
        this._run(task);
    }

    public stop() {
    }

    private _run(task: AsyncTask): void {
        task(() => {

            if (this._toDoList.length > 0) {
                setTimeout(() => {
                    this._run(this._toDoList.shift());
                }, 1);

            }
        });
    }
}
export abstract class BasicNetworkTestBase {

    private mTestRunner = new TestTaskRunner();
    private mCreatedNetworks = new Array<IBasicNetwork>();
    public mDefaultWaitTimeout = 5000;


    public abstract _CreateNetworkImpl(): IBasicNetwork;

    public setup(): void {

        beforeEach(() => {
            this.mTestRunner.stop();
            this.mTestRunner = new TestTaskRunner();
            this.mCreatedNetworks = new Array<IBasicNetwork>();
        });
    }
    public _CreateNetwork(): IBasicNetwork {
        let net = this._CreateNetworkImpl();
        this.mCreatedNetworks.push(net);
        return net;
    }

    public then(syncTask: Task) {

        this.mTestRunner.then(syncTask);
    }
    public thenAsync(task: AsyncTask) {

        this.mTestRunner.thenAsync(task);
    }
    public start() {
        this.mTestRunner.start();
    }
    //public waitForEvent(net: IBasicNetwork) {


    //    var wrap = (finished: Task) => {
    //        var timeout = 1000;
    //        var interval = 100;
    //        var intervalHandle;

    //        intervalHandle = setInterval(() => {

    //            this.UpdateAll();
    //            this.FlushAll();
    //            timeout -= interval;

    //            if (net.Peek() != null) {
    //                clearInterval(intervalHandle);
    //                finished();
    //            } else if (timeout <= 0) {
    //                clearInterval(intervalHandle);
    //                finished();
    //            }
    //        }, interval);
    //    };
    //    this.mTestRunner.thenAsync(wrap);
    //}
    public waitForEvent(net: IBasicNetwork, finished : Task, timeout?:number) {

        if (timeout == null)
            timeout = this.mDefaultWaitTimeout;
        
        var interval = 50;
        var intervalHandle;

        intervalHandle = setInterval(() => {

            this.UpdateAll();
            this.FlushAll();
            timeout -= interval;

            if (net.Peek() != null) {
                clearInterval(intervalHandle);
                finished();
            } else if (timeout <= 0) {
                clearInterval(intervalHandle);
                finished();
            }
        }, interval);
    }
    public UpdateAll(): void {
        for (let v of this.mCreatedNetworks) {
            v.Update();
        }
    }
    public FlushAll(): void {
        for (let v of this.mCreatedNetworks) {
            v.Flush();
        }
    }
    public ShutdownAll(): void {
        for (let v of this.mCreatedNetworks) {
            v.Shutdown();
        }
        this.mCreatedNetworks = new Array<IBasicNetwork>();
    }

    
    public _CreateServerNetwork(result: (IBasicNetwork, string) => void)
    {
        var srv = this._CreateNetwork();
        srv.StartServer();
        this.waitForEvent(srv, () => {
            var evt = srv.Dequeue();
            expect(evt).not.toBeNull();
            expect(evt.Type).toBe(NetEventType.ServerInitialized);
            expect(evt.Info).not.toBeNull();
            var address = evt.Info;
            result(srv, address);
        });
    }

    public _Connect(srv: IBasicNetwork, address: string, clt: IBasicNetwork, result: (srvToCltId: ConnectionId, cltToSrvId: ConnectionId) => void) {

        var evt: NetworkEvent;
        var cltToSrvId = clt.Connect(address);
        var srvToCltId: ConnectionId;

        this.waitForEvent(clt, () => {

            evt = clt.Dequeue();
            expect(evt).not.toBeNull();
            expect(evt.Type).toBe(NetEventType.NewConnection);
            expect(evt.ConnectionId.id).toBe(cltToSrvId.id);

            this.waitForEvent(srv, () => {

                evt = srv.Dequeue();
                expect(evt).not.toBeNull();
                expect(evt.Type).toBe(NetEventType.NewConnection);
                expect(evt.ConnectionId.id).not.toBe(ConnectionId.INVALID.id);
                srvToCltId = evt.ConnectionId;

                result(srvToCltId, cltToSrvId);
            });
        });

    }
    public _CreateServerClient(result: (srv: IBasicNetwork, address: string, srvToCltId: ConnectionId, clt: IBasicNetwork, cltToSrvId: ConnectionId) => void) {

        let srv: IBasicNetwork;
        let address: string;
        let srvToCltId: ConnectionId;
        let clt: IBasicNetwork;
        let cltToSrvId: ConnectionId;

        this._CreateServerNetwork((rsrv, raddress) => {
            srv = rsrv;
            address = raddress;

            clt = this._CreateNetwork();

            this._Connect(srv, address, clt, (rsrvToCltId, rcltToSrvId) => {
                srvToCltId = rsrvToCltId;
                cltToSrvId = rcltToSrvId;


                result(srv, address, srvToCltId, clt, cltToSrvId);
            });
        });
    }
}