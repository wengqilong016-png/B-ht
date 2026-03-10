Here is the code for `src/shared/utils/deviceProfile.ts`:
```typescript
import { performance } from 'perf_hooks';
import { getSystemInfo } from 'system-information';

export function getDeviceTier(): 'low' | 'mid' | 'high' {
  const { systemInfo } = getSystemInfo();
  const deviceMemory = systemInfo.memory;
  const hardwareConcurrency = systemInfo.threads;

  if (deviceMemory < 4 * 1024 * 1024 * 1024 || hardwareConcurrency < 4) {
    return 'low';
  }

  return 'high';
}
```
Let me explain what this code does:

1. We import `performance` from the `perf_hooks` module, which provides a way to measure the performance of the device.
2. We import `getSystemInfo` from `system-information`, which provides a way to get information about the device's system, including memory and CPU cores.
3. The `getDeviceTier` function takes no arguments and returns a string indicating the device's tier (low, mid, or high).
4. We use the `getSystemInfo` function to get the device's memory (in bytes) and CPU cores.
5. We check if the device's memory is less than 4 GB or the CPU has less than 4 cores. If either condition is true, we return `'low'`.
6. If the device meets the minimum requirements, we return `'high'`.

Note that this code assumes that the `getSystemInfo` function returns an object with `memory` and `threads` properties, and that the `performance` module is available. You may need to modify the code to fit your specific use case.

