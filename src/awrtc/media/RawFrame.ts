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
import { SLog } from "../network/Helper";
import { BrowserMediaStream } from "../media_browser/index";

export enum FramePixelFormat {
    Invalid = 0,
    Format32bppargb
}




//replace with interface after typescript 2.0 update (properties in interfaces aren't supported yet)
export class IFrameData {

    public get Format(): FramePixelFormat{
        return FramePixelFormat.Format32bppargb;
    }

    public get Buffer(): Uint8Array {
        return null;
    }

    public get Width(): number {
        return -1;
    }


    public get Height(): number {
        return -1;
    }

    public constructor() { }

    public ToTexture(gl: WebGL2RenderingContext, texture: WebGLTexture) : boolean{
        return false;
    }
    /*
    public ToTexture2(gl: WebGL2RenderingContext) : WebGLTexture{
        return null;
    }
    */
}

//Container for the raw bytes of the current frame + height and width.
//Format is currently fixed based on the browser getImageData format
export class RawFrame extends IFrameData{

    private mBuffer: Uint8Array = null;
    public get Buffer(): Uint8Array {
        return this.mBuffer;
    }
    
    private mWidth: number;
    public get Width(): number {
        return this.mWidth;
    }

    private mHeight: number;
    public get Height(): number {
        return this.mHeight;
    }


    constructor(buffer: Uint8Array, width: number, height: number) {
        super();
        this.mBuffer = buffer;
        this.mWidth = width;
        this.mHeight = height;
    }

}

/**
 * This class is suppose to increase the speed of the java script implementation.
 * Instead of creating RawFrames every Update call (because the real fps are unknown currently) it will
 * only create a lazy frame which will delay the creation of the RawFrame until the user actually tries
 * to access any data.
 * Thus if the game slows down or the user doesn't access any data the expensive copy is avoided.
 * 
 * This comes with the downside of risking a change in Width / Height at the moment. In theory the video could
 * change the resolution causing the values of Width / Height to change over time before Buffer is accessed to create
 * a copy that will be save to use. This should be ok as long as the frame is used at the time it is received.
 */
export class LazyFrame extends IFrameData{

    private mFrameGenerator: BrowserMediaStream;
    public get FrameGenerator() {
        return this.mFrameGenerator;
    }
    private mRawFrame: RawFrame;


    public get Buffer(): Uint8Array {
        this.GenerateFrame();
        if (this.mRawFrame == null)
            return null;
        return this.mRawFrame.Buffer;
    }

    /**Returns the expected width of the frame.
     * Watch out this might change inbetween frames!
     * 
     */
    public get Width(): number {
        if (this.mRawFrame == null)
        {
            return this.mFrameGenerator.VideoElement.videoWidth;
        }else{
            return this.mRawFrame.Width;
        }
        /*
        this.GenerateFrame();
        if (this.mRawFrame == null)
            return -1;
        return this.mRawFrame.Width;
        */
    }

    /**Returns the expected height of the frame.
     * Watch out this might change inbetween frames!
     * 
     */
    public get Height(): number {
        if (this.mRawFrame == null)
        {
            return this.mFrameGenerator.VideoElement.videoHeight;
        }else{
            return this.mRawFrame.Height;
        }
        /*
        this.GenerateFrame();
        if (this.mRawFrame == null)
            return -1;
        return this.mRawFrame.Height;
        */
    }


    constructor(frameGenerator: BrowserMediaStream) {
        super();
        this.mFrameGenerator = frameGenerator;
    }

    /**Intendet for use via the Unity plugin.
     * Will copy the image directly into a texture to avoid overhead of a CPU side copy.
     * 
     * The given texture should have the correct size before calling this method.
     * 
     * @param gl 
     * @param texture 
     */
    public ToTexture(gl: WebGL2RenderingContext, texture: WebGLTexture) : boolean{
        gl.bindTexture(gl.TEXTURE_2D, texture);
        /*
        const level = 0;
        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, this.mFrameGenerator.VideoElement);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        */
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, this.mFrameGenerator.VideoElement);
        return true;
    }
    /*
    public ToTexture2(gl: WebGL2RenderingContext) : WebGLTexture{
        let tex = gl.createTexture()
        this.ToTexture(gl, tex)
        return;
    }
    */

    //Called before access of any frame data triggering the creation of the raw frame data
    private GenerateFrame() {

        if (this.mRawFrame == null) {
            try {
                this.mRawFrame = this.mFrameGenerator.CreateFrame();
            } catch (exception) {
                this.mRawFrame = null;
                SLog.LogWarning("frame skipped in GenerateFrame due to exception: " + JSON.stringify(exception));
            }
        }
    }

}