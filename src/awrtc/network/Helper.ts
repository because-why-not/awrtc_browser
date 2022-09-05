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
/**Contains some helper classes to keep the typescript implementation
 * similar to the C# implementation.
 * 
 */

export class Queue<T> {
    private mArr: Array<T> = new Array<T>();
    constructor() {
    }

    public Enqueue(val: T) {
        this.mArr.push(val);
    }

    public TryDequeue(outp: Output<T> ): boolean{
        
        var res = false

        if (this.mArr.length > 0) {
            outp.val = this.mArr.shift();
            res = true;
        }
        return res;
    }

    public Dequeue(): T {
        if (this.mArr.length > 0) {
            return this.mArr.shift();
        } else {
            return null;
        }
    }
    public Peek(): T {
        if (this.mArr.length > 0) {
            return this.mArr[0];
        } else {
            return null;
        }
    }
    public Count(): number{
        return this.mArr.length;
    }

    public Clear():void
    {
        this.mArr = new Array<T>();
    }
}

export class List<T> {
    private mArr: Array<T> = new Array<T>();
    public get Internal() : Array<T>
    {
        return this.mArr;
    }
    constructor() {
    }

    public Add(val: T) {
        this.mArr.push(val);
    }


    public get Count(): number {
        return this.mArr.length;
    }
}

export class Output<T>
{
    public val : T;
}

export class SLogger{
    private mPrefix: string;
    public get Prefix() {
        return this.mPrefix;
    }
    public set Prefix(prefix:string) {
        this.mPrefix = prefix;
    }

    constructor(prefix: string) {
        this.mPrefix = prefix;
    }

    public CreateSub(subPrefix: string): SLogger {
        return new SLogger(this.mPrefix + "." + subPrefix);
    }

    public LV(txt: string) {
        SLog.L(this.mPrefix + ": " + txt);
    }
    public L(txt: string) {
        SLog.L(this.mPrefix + ": " + txt);
    }
    public LW(txt: string) {
        SLog.LW(this.mPrefix + ": " + txt);
    }
    public LE(txt: string) {
        SLog.LE(this.mPrefix + ": " + txt);
    }
}
export class Debug {
    public static Log(s: any) {
        SLog.Log(s);
    }
    public static LogError(s: any) {
        SLog.LogError(s);
    }
    public static LogWarning(s: any) {
        SLog.LogWarning(s);
    }
}

export abstract class Encoder {

    public abstract GetBytes(text: string): Uint8Array;
    public abstract GetString(buffer: Uint8Array): string;
}

export class UTF16Encoding extends Encoder{
    constructor() {
        super();
    }
    public GetBytes(text: string): Uint8Array {
        return this.stringToBuffer(text);
    }
    public GetString(buffer: Uint8Array): string {
        return this.bufferToString(buffer);
    }


    private bufferToString(buffer: Uint8Array): string {
        let arr = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
        return String.fromCharCode.apply(null, arr);
    }

    private stringToBuffer(str: string): Uint8Array {
        let buf = new ArrayBuffer(str.length * 2);
        let bufView = new Uint16Array(buf);
        for (var i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }

        let result = new Uint8Array(buf);
        return result;
    }
}
export class Encoding {

    public static get UTF16() {
        return new UTF16Encoding();
    }

    constructor() {

    }

}

export class Random {
    //value between min and max (not including max)
    public static getRandomInt(min, max): number {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min)) + min;
    }
}

export class Helper {
    public static tryParseInt(value : string): number {  
        try {
            if (/^(\-|\+)?([0-9]+)$/.test(value)) {
                let result = Number(value);
                if (isNaN(result) == false)
                    return result;
            }

        } catch ( e) {
        }
        return null;
    }
}
export enum SLogLevel
{
    None = 0,
    Errors = 1,
    Warnings = 2,
    Info = 3
}
//Simplified logger
export class SLog {

    private static sLogLevel: SLogLevel = SLogLevel.Warnings;

    public static SetLogLevel(level: SLogLevel)
    {
        SLog.sLogLevel = level;
    }
    public static RequestLogLevel(level: SLogLevel)
    {
        if(level > SLog.sLogLevel)
            SLog.sLogLevel = level;
    }


    public static L(msg: any, tag?:string): void {
        SLog.Log(msg, tag);
    }
    public static LW(msg: any, tag?:string): void {
        SLog.LogWarning(msg, tag);
    }
    public static LE(msg: any, tag?:string): void {
        SLog.LogError(msg, tag);
    }
    public static Log(msg: any, tag?:string): void {
        
        if(SLog.sLogLevel >= SLogLevel.Info)
        {
            if(tag)
            {
                console.log(msg, tag);
            }else{
                console.log(msg);
            }
        }
    }
    public static LogWarning(msg: any, tag?:string): void {
        if(!tag)
            tag = "";
        if(SLog.sLogLevel >= SLogLevel.Warnings)
        {
            if(tag)
            {
                console.warn(msg, tag);
            }else{
                console.warn(msg);
            }
        }
    }

    public static LogError(msg: any, tag?:string) {
        
        if(SLog.sLogLevel >= SLogLevel.Errors)
        {
            if(tag)
            {
                console.error(msg, tag);
            }else{
                console.error(msg);
            }
        }
            
    }
}