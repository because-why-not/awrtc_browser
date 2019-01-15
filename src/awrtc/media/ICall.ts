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
import { CallEventHandler } from "./CallEventArgs";
import { ConnectionId } from "../network/index";
import { MediaConfig } from "./MediaConfig";

/** Mostly the same as the C# side ICall interface.
 * 
 * Usage of this interface usually follows a specific pattern:
 * 1. Create a platform specific instance via a factory with a specific
 * NetworkConfig
 * 2. Register an event handler at CallEvent and call Update regularly
 * (ideally once for each frame shown to the user in realtime
 * applcations so 30-60 times per second)
 * 3. Call configure with your own MediaConfig instance defining what
 * features you need. 
 * 4. Wait for a ConfigurationComplete (or failed) event. During this
 * time the platform might ask the user the allow access to the devices.
 * 5. Either call Listen with an address to wait for an incoming connection
 * or use Call to conect another ICall that already listens on that address.
 * 6. Wait for CallAccepted and other events. The call is now active and
 *    you can use Send messages, change volume, ...
 * 7. Call Dispose to cleanup
 * 
 * Do not forget to call Dispose method after you finished the call or the connection
 * might run forever in the background!
 * 
 * See example apps and guides for more information.
 */
export interface ICall {

    addEventListener(listener: CallEventHandler): void;
    removeEventListener(listener: CallEventHandler): void;

    Call(address: string): void;
    Configure(config: MediaConfig): void;
    Listen(address: string): void;
    Send(message: string, reliable?:boolean, id? :ConnectionId): void
    SendData(message: Uint8Array, reliable: boolean, id: ConnectionId): void
    Update(): void;
    Dispose(): void;
}