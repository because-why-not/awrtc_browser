import { VideoInput } from "../awrtc/index";

export function VideoInputTest_export()
{


}

export function MakeTestCanvas() : HTMLCanvasElement{

    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    //make blue for debugging purposes
    ctx.fillStyle = "blue";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

export function MakeBrokenTestCanvas() : HTMLCanvasElement{

    let canvas = document.createElement("canvas");
    return canvas;
}

describe("VideoInputTest", () => {

    beforeEach(()=>{
        
    });
    it("AddRem", () => {
        let name = "test_canvas";
        let vi = new VideoInput();
        let canvas = document.createElement("canvas")

        expect(vi.HasDevice(name)).toBe(false);
        vi.AddCanvasDevice(name, canvas);
        expect(vi.HasDevice(name)).toBe(true);
        
        vi.RemCanvasDevice(name);
        expect(vi.HasDevice(name)).toBe(false);
    });
    it("GetDeviceNames", () => {
        let name = "test_canvas";
        let name2 = "test_canvas2";
        let vi = new VideoInput();
        let canvas = document.createElement("canvas")
        let names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(0);


        vi.AddCanvasDevice(name, canvas);
        names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(1);
        expect(names[0]).toBe(name);

        
        vi.AddCanvasDevice(name, canvas);
        names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(1);
        expect(names[0]).toBe(name);

        vi.AddCanvasDevice(name2, canvas);
        names = vi.GetDeviceNames();
        expect(names).toBeTruthy();
        expect(names.length).toBe(2);
        expect(names.sort()).toEqual([name, name2].sort());
        
    });

    it("GetStream", () => {
        let name = "test_canvas";
        let vi = new VideoInput();
        let canvas = MakeTestCanvas();
        
        let stream = vi.GetStream(name);
        expect(stream).toBeNull();


        vi.AddCanvasDevice(name, canvas);
        stream = vi.GetStream(name);
        expect(stream).toBeTruthy();
        
    });

    //not yet clear how this can be handled
    //this test will trigger an error in firefox
    it("GetStream_no_context", () => {
        let name = "test_canvas";
        let vi = new VideoInput();
        let canvas = MakeBrokenTestCanvas();
        //let ctx = canvas.getContext("2d");
        
        
        
        let stream = vi.GetStream(name);
        expect(stream).toBeNull();


        vi.AddCanvasDevice(name, canvas);
        stream = vi.GetStream(name);
        expect(stream).toBeTruthy();
        
    });
    
});