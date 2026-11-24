import { createMotion, createStarterDocument } from '@galbe/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentStore } from './documentStore.ts';
import { bakePlayhead, deleteSelectedKeys, keyTime, usePlaybackStore } from './playbackStore.ts';

const doc = () => useDocumentStore.getState().doc;
const playback = () => usePlaybackStore.getState();
const nodeId = () => doc().nodes[0]!.id;
const moveX = (x: number) =>
  useDocumentStore.getState().update(
    (draft) => {
      draft.nodes[0]!.transform.position[0] = x;
    },
    { label: 'Move' },
  );

describe('auto-key and playback', () => {
  beforeEach(() => {
    useDocumentStore.getState().load(createStarterDocument());
    usePlaybackStore.setState({ time: 0, playing: false, autoKey: false, selectedKeys: [] });
  });

  it('snaps the playhead to frames and clamps it to the timeline', () => {
    playback().seek(1.01);
    expect(playback().time).toBeCloseTo(1);
    playback().step(3);
    expect(keyTime()).toBeCloseTo(1.1);
    playback().seek(99);
    expect(playback().time).toBe(4);
  });

  it('leaves edits alone without auto-key, keys them with it', () => {
    moveX(1);
    expect(doc().animation.tracks).toHaveLength(0);
    playback().setAutoKey(true);
    playback().seek(2);
    moveX(3);
    const track = doc().animation.tracks[0]!;
    expect(track.path).toBe(`nodes.${nodeId()}.transform.position.0`);
    expect(track.keyframes.map((k) => [k.time, k.value])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // Undo removes the edit and its keys together.
    useDocumentStore.getState().undo();
    expect(doc().animation.tracks).toHaveLength(0);
  });

  it('keys tracked properties even with auto-key off, and bakes the playhead', () => {
    playback().setAutoKey(true);
    playback().seek(2);
    moveX(3);
    playback().setAutoKey(false);
    playback().seek(1);
    bakePlayhead();
    // The document shows the animated value at the playhead…
    expect(doc().nodes[0]!.transform.position[0]).toBeCloseTo(1.5);
    // …and editing it keys it there.
    moveX(5);
    expect(doc().animation.tracks[0]!.keyframes).toHaveLength(3);
    usePlaybackStore.setState({ selectedKeys: [doc().animation.tracks[0]!.keyframes[1]!.id] });
    expect(deleteSelectedKeys()).toBe(true);
    expect(doc().animation.tracks[0]!.keyframes).toHaveLength(2);
  });

  it('never keys structural edits such as adding a motion', () => {
    playback().setAutoKey(true);
    playback().seek(1);
    useDocumentStore.getState().update(
      (draft) => {
        draft.animation.motions.push(createMotion('spin', { nodeId: draft.nodes[0]!.id }));
      },
      { animate: false },
    );
    expect(doc().animation.tracks).toHaveLength(0);
    expect(doc().animation.motions).toHaveLength(1);
  });
});
