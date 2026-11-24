import { findNode, type GalbeDocument, type Motion, type MotionType } from '@galbe/core';

export const MOTION_LABELS: Record<MotionType, string> = {
  spin: 'Spin',
  float: 'Float',
  swing: 'Swing',
  wave: 'Wave',
  reveal: 'Reveal',
  materialTransition: 'Material',
  orbit: 'Orbit',
  truck: 'Truck',
  dolly: 'Dolly',
};

export const MOTION_HINTS: Record<MotionType, string> = {
  spin: 'Whole turns around an axis — loops seamlessly',
  float: 'Gentle up-and-down drift with a slight tilt',
  swing: 'Rocks back and forth around an axis',
  wave: 'A wave runs through the letters (or paths)',
  reveal: 'Letters (or paths) appear one after the other',
  materialTransition: 'Blends into another material and back',
  orbit: 'The camera circles around its target',
  truck: 'The camera slides sideways',
  dolly: 'The camera moves towards its target',
};

export function motionTargetName(doc: GalbeDocument, motion: Motion): string {
  if (!('nodeId' in motion)) return 'Camera';
  return findNode(doc, motion.nodeId)?.name ?? 'Layer';
}
