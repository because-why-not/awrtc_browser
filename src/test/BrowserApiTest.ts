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
//current setup needs to load everything as a module
export function some_random_export_1()
{

}
describe("BrowserApiTest_MediaStreamApi", () => {

    beforeEach(()=>{
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });

    it("devices", (done) => {
        navigator.mediaDevices.enumerateDevices()
        .then(function(devices) 
        {
            expect(devices).not.toBeNull();
            devices.forEach(function(device) {
                console.log(device.kind + ": " + device.label +
                            " id = " + device.deviceId);
            });
            done();
        })
        .catch(function(err) {
          console.log(err.name + ": " + err.message);
          fail();
        });
    });
    it("devices2", (done) => {
        let gStream;
        let constraints = {video:{deviceId:undefined}, audio:{deviceId:undefined}} as MediaStreamConstraints;
        navigator.mediaDevices.getUserMedia(constraints)
        .then((stream)=>{
            //if this stream stops the access to labels disapears again after
            //a few ms (tested in firefox)
            gStream = stream;
            navigator.mediaDevices.enumerateDevices()
            .then(function(devices) 
            {
                expect(devices).not.toBeNull();
                
                devices.forEach(function(device) {

                expect(device.label).not.toBeNull();
                expect(device.label).not.toBe("");
                    console.log(device.kind + ": " + device.label +
                                " id = " + device.deviceId);
                });
                gStream.getTracks().forEach(t => {
                    t.stop();
                });
                done();
            })
            .catch(function(err) {
              console.log(err.name + ": " + err.message);
              fail();
            });
        })
        .catch((err)=>{
            console.log(err.name + ": " + err.message);
            fail();
        });
    });


    it("devices3", (done) => {
        let gStream;
        let constraints = {video: true, audio:false} as MediaStreamConstraints;
        navigator.mediaDevices.getUserMedia(constraints)
        .then((stream)=>{
            //if this stream stops the access to labels disapears again after
            //a few ms (tested in firefox)
            gStream = stream;
            navigator.mediaDevices.enumerateDevices()
            .then(function(devices) 
            {
                expect(devices).not.toBeNull();
                
                devices.forEach(function(device) {

                expect(device.label).not.toBeNull();
                expect(device.label).not.toBe("");
                    console.log(device.kind + ": " + device.label +
                                " id = " + device.deviceId);
                });
                gStream.getTracks().forEach(t => {
                    t.stop();
                });
                done();
            })
            .catch(function(err) {
              console.log(err.name + ": " + err.message);
              fail();
            });
        })
        .catch((err)=>{
            console.log(err.name + ": " + err.message);
            fail();
        });
    });
    
});

