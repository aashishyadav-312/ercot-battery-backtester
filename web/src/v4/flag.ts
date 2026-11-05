// LOCAL STUB of the V4 feature flag. Step 3 creates web/src/config/features.ts with the same contract
// (`export const V4: boolean`, true when VITE_V4 === '1' or the URL has ?v4=1). Until that merges, this file computes it
// the same way. When it merges, replace the body with `export { V4 } from '../config/features';` and delete the stub.
const fromUrl = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('v4') === '1';
  } catch {
    return false;
  }
};

export const V4: boolean = import.meta.env.VITE_V4 === '1' || fromUrl();
