/**
 * @license
 * Copyright 2022 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import expect from 'expect';

import type {CDPSessionEvents} from '../api/CDPSession.js';
import {TimeoutError} from '../common/Errors.js';
import {EventEmitter} from '../common/EventEmitter.js';
import {TimeoutSettings} from '../common/TimeoutSettings.js';

import {
  DeviceRequestPrompt,
  DeviceRequestPromptDevice,
  DeviceRequestPromptManager,
} from './DeviceRequestPrompt.js';

class MockCDPSession extends EventEmitter<CDPSessionEvents> {
  async send(): Promise<any> {}
  connection() {
    return undefined;
  }
  readonly detached = false;
  async detach() {}
  id() {
    return '1';
  }
  parentSession() {
    return undefined;
  }
}

describe('DeviceRequestPrompt', function () {
  describe('waitForDevicePrompt', function () {
    it('should return prompt', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      const [prompt] = await Promise.all([
        manager.waitForDevicePrompt(),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [],
          });
        })(),
      ]);
      expect(prompt).toBeTruthy();
    });

    it('should respect timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      await expect(
        manager.waitForDevicePrompt({timeout: 1}),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should respect default timeout when there is no custom timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      timeoutSettings.setDefaultTimeout(1);
      await expect(manager.waitForDevicePrompt()).rejects.toBeInstanceOf(
        TimeoutError,
      );
    });

    it('should prioritize exact timeout over default timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      timeoutSettings.setDefaultTimeout(0);
      await expect(
        manager.waitForDevicePrompt({timeout: 1}),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should work with no timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      const [prompt] = await Promise.all([
        manager.waitForDevicePrompt({timeout: 0}),
        (async () => {
          await new Promise(resolve => {
            setTimeout(resolve, 50);
          });
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [],
          });
        })(),
      ]);
      expect(prompt).toBeTruthy();
    });

    it('should return the same prompt when there are many watchdogs simultaneously', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      const [prompt1, prompt2] = await Promise.all([
        manager.waitForDevicePrompt(),
        manager.waitForDevicePrompt(),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [],
          });
        })(),
      ]);
      expect(prompt1 === prompt2).toBeTruthy();
    });

    it('should listen and shortcut when there are no watchdogs', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const manager = new DeviceRequestPromptManager(client, timeoutSettings);

      client.emit('DeviceAccess.deviceRequestPrompted', {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      expect(manager).toBeTruthy();
    });
  });

  describe('DeviceRequestPrompt.devices', function () {
    it('lists devices as they arrive', function () {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      expect(prompt.devices).toHaveLength(0);
      client.emit('DeviceAccess.deviceRequestPrompted', {
        id: '00000000000000000000000000000000',
        devices: [{id: '00000000', name: 'Device 0'}],
      });
      expect(prompt.devices).toHaveLength(1);
      client.emit('DeviceAccess.deviceRequestPrompted', {
        id: '00000000000000000000000000000000',
        devices: [
          {id: '00000000', name: 'Device 0'},
          {id: '11111111', name: 'Device 1'},
        ],
      });
      expect(prompt.devices).toHaveLength(2);
      expect(prompt.devices[0]).toBeInstanceOf(DeviceRequestPromptDevice);
      expect(prompt.devices[1]).toBeInstanceOf(DeviceRequestPromptDevice);
    });

    it('does not list devices from events of another prompt', function () {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      expect(prompt.devices).toHaveLength(0);
      client.emit('DeviceAccess.deviceRequestPrompted', {
        id: '88888888888888888888888888888888',
        devices: [
          {id: '00000000', name: 'Device 0'},
          {id: '11111111', name: 'Device 1'},
        ],
      });
      expect(prompt.devices).toHaveLength(0);
    });
  });

  describe('DeviceRequestPrompt.waitForDevice', function () {
    it('should return first matching device', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      const [device] = await Promise.all([
        prompt.waitForDevice(({name}) => {
          return name.includes('1');
        }),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [{id: '00000000', name: 'Device 0'}],
          });
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [
              {id: '00000000', name: 'Device 0'},
              {id: '11111111', name: 'Device 1'},
            ],
          });
        })(),
      ]);
      expect(device).toBeInstanceOf(DeviceRequestPromptDevice);
    });

    it('should return first matching device from already known devices', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [
          {id: '00000000', name: 'Device 0'},
          {id: '11111111', name: 'Device 1'},
        ],
      });

      const device = await prompt.waitForDevice(({name}) => {
        return name.includes('1');
      });
      expect(device).toBeInstanceOf(DeviceRequestPromptDevice);
    });

    it('should return device in the devices list', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      const [device] = await Promise.all([
        prompt.waitForDevice(({name}) => {
          return name.includes('1');
        }),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [
              {id: '00000000', name: 'Device 0'},
              {id: '11111111', name: 'Device 1'},
            ],
          });
        })(),
      ]);
      expect(prompt.devices).toContain(device);
    });

    it('should respect timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      await expect(
        prompt.waitForDevice(
          ({name}) => {
            return name.includes('Device');
          },
          {timeout: 1},
        ),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should respect default timeout when there is no custom timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      timeoutSettings.setDefaultTimeout(1);
      await expect(
        prompt.waitForDevice(
          ({name}) => {
            return name.includes('Device');
          },
          {timeout: 1},
        ),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should prioritize exact timeout over default timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      timeoutSettings.setDefaultTimeout(0);
      await expect(
        prompt.waitForDevice(
          ({name}) => {
            return name.includes('Device');
          },
          {timeout: 1},
        ),
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('should work with no timeout', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      const [device] = await Promise.all([
        prompt.waitForDevice(
          ({name}) => {
            return name.includes('1');
          },
          {timeout: 0},
        ),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [{id: '00000000', name: 'Device 0'}],
          });
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [
              {id: '00000000', name: 'Device 0'},
              {id: '11111111', name: 'Device 1'},
            ],
          });
        })(),
      ]);
      expect(device).toBeInstanceOf(DeviceRequestPromptDevice);
    });

    it('should be able to abort', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });
      const abortController = new AbortController();

      const task = prompt.waitForDevice(
        () => {
          return false;
        },
        {signal: abortController.signal},
      );
      abortController.abort();
      await expect(task).rejects.toThrow(/aborted/);
    });

    it('should return same device from multiple watchdogs', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      const [device1, device2] = await Promise.all([
        prompt.waitForDevice(({name}) => {
          return name.includes('1');
        }),
        prompt.waitForDevice(({name}) => {
          return name.includes('1');
        }),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [{id: '00000000', name: 'Device 0'}],
          });
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [
              {id: '00000000', name: 'Device 0'},
              {id: '11111111', name: 'Device 1'},
            ],
          });
        })(),
      ]);
      expect(device1 === device2).toBeTruthy();
    });
  });

  describe('DeviceRequestPrompt.select', function () {
    it('should succeed with listed device', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      const [device] = await Promise.all([
        prompt.waitForDevice(({name}) => {
          return name.includes('1');
        }),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [
              {id: '00000000', name: 'Device 0'},
              {id: '11111111', name: 'Device 1'},
            ],
          });
        })(),
      ]);
      await prompt.select(device);
    });

    it('should error for device not listed in devices', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      await expect(
        prompt.select(new DeviceRequestPromptDevice('11111111', 'Device 1')),
      ).rejects.toThrow('Cannot select unknown device!');
    });

    it('should fail when selecting prompt twice', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });

      const [device] = await Promise.all([
        prompt.waitForDevice(({name}) => {
          return name.includes('1');
        }),
        (() => {
          client.emit('DeviceAccess.deviceRequestPrompted', {
            id: '00000000000000000000000000000000',
            devices: [
              {id: '00000000', name: 'Device 0'},
              {id: '11111111', name: 'Device 1'},
            ],
          });
        })(),
      ]);
      await prompt.select(device);
      await expect(prompt.select(device)).rejects.toThrow(
        'Cannot select DeviceRequestPrompt which is already handled!',
      );
    });
  });

  describe('DeviceRequestPrompt.cancel', function () {
    it('should succeed on first call', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });
      await prompt.cancel();
    });

    it('should fail when canceling prompt twice', async () => {
      const client = new MockCDPSession();
      const timeoutSettings = new TimeoutSettings();
      const prompt = new DeviceRequestPrompt(client, timeoutSettings, {
        id: '00000000000000000000000000000000',
        devices: [],
      });
      await prompt.cancel();
      await expect(prompt.cancel()).rejects.toThrow(
        'Cannot cancel DeviceRequestPrompt which is already handled!',
      );
    });
  });
});
