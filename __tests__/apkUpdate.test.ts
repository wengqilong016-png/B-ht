import { describe, expect, it, jest } from '@jest/globals';

const registerPluginMock = jest.fn((name: string) => ({ __pluginName: name }));

jest.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => registerPluginMock(name),
}));

import { ApkUpdate } from '../services/apkUpdate';

describe('apkUpdate service', () => {
  it('registers the ApkUpdate plugin', () => {
    expect(registerPluginMock).toHaveBeenCalledWith('ApkUpdate');
    expect(ApkUpdate).toEqual({ __pluginName: 'ApkUpdate' });
  });
});
