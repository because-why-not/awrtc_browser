import { SLog } from "../awrtc/network/Helper";

describe('SLog', () => {
    beforeEach(() => {
        // Reset the time prefix feature to a known state before each test
        SLog.SetTimePrefix(false);
    });

    it('add time prefix', () => {
        SLog.SetTimePrefix(true);
        const logSpy = spyOn(console, 'log');
        
        SLog.Log('Test message');

        expect(logSpy).toHaveBeenCalledWith(jasmine.stringMatching(/^\[\d+ ms\] Test message$/));
        logSpy.calls.reset();
    });

    it('do not add time prefix', () => {
        SLog.SetTimePrefix(false);
        const logSpy = spyOn(console, 'log');
        
        SLog.Log('Test message');

        expect(logSpy).toHaveBeenCalledWith('Test message');
        logSpy.calls.reset();
    });

    it('time prefix correct time', async () => {
        SLog.SetTimePrefix(true);
        const delay = 100; // ms
        const logSpy = spyOn(console, 'log');

        await new Promise(resolve => setTimeout(resolve, delay));
        
        SLog.Log('Delayed message');
        expect(logSpy).toHaveBeenCalledWith(jasmine.stringMatching(/^\[\d+ ms\] Delayed message$/));
        
        const loggedTime = parseInt(logSpy.calls.first().args[0].match(/\[(\d+) ms\]/)[1]);
        expect(loggedTime).toBeGreaterThanOrEqual(delay);
        expect(loggedTime).toBeLessThan(delay + 20); // Allowing a small margin of error

        logSpy.calls.reset();
    });
});