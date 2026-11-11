import { describe, it, expect } from "vitest";
import { isFaststartMp4, remuxMp4FaststartPure, ensureFaststartMp4 } from "../utils/faststart";

/**
 * Helper to construct a synthetic ISO-BMFF box buffer.
 */
function makeBox(type: string, payload: Buffer): Buffer {
  const size = 8 + payload.length;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

/**
 * Helper to construct a synthetic moov atom with a valid stco box.
 */
function makeMoovBox(offsets: number[]): Buffer {
  // stco payload: version(1B) + flags(3B) + entry_count(4B) + offsets(N*4B)
  const stcoPayload = Buffer.alloc(8 + offsets.length * 4);
  stcoPayload.writeUInt8(0, 0); // version
  stcoPayload.writeUInt32BE(offsets.length, 4); // entry count
  offsets.forEach((off, i) => {
    stcoPayload.writeUInt32BE(off, 8 + i * 4);
  });
  const stcoBox = makeBox("stco", stcoPayload);

  // Wrap inside stbl -> minf -> mdia -> trak -> moov
  const stblBox = makeBox("stbl", stcoBox);
  const minfBox = makeBox("minf", stblBox);
  const mdiaBox = makeBox("mdia", minfBox);
  const trakBox = makeBox("trak", mdiaBox);
  return makeBox("moov", trakBox);
}

describe("Fast-Start MP4 Remuxing Engine", () => {
  it("should accurately identify already faststart MP4 (moov before mdat)", () => {
    const ftyp = makeBox("ftyp", Buffer.from("isommp42"));
    const moov = makeMoovBox([100, 200, 300]);
    const mdat = makeBox("mdat", Buffer.alloc(500));

    const faststartFile = Buffer.concat([ftyp, moov, mdat]);
    expect(isFaststartMp4(faststartFile)).toBe(true);
  });

  it("should identify non-faststart MP4 (mdat before moov)", () => {
    const ftyp = makeBox("ftyp", Buffer.from("isommp42"));
    const mdat = makeBox("mdat", Buffer.alloc(500));
    const moov = makeMoovBox([100, 200, 300]);

    const nonFaststartFile = Buffer.concat([ftyp, mdat, moov]);
    expect(isFaststartMp4(nonFaststartFile)).toBe(false);
  });

  it("should remux non-faststart MP4 by placing moov before mdat and adjusting stco offsets", () => {
    const ftyp = makeBox("ftyp", Buffer.from("isommp42"));
    const mdatPayload = Buffer.alloc(1000);
    const mdat = makeBox("mdat", mdatPayload);
    const initialOffsets = [500, 800, 1200];
    const moov = makeMoovBox(initialOffsets);

    const originalFile = Buffer.concat([ftyp, mdat, moov]);
    expect(isFaststartMp4(originalFile)).toBe(false);

    const remuxed = remuxMp4FaststartPure(originalFile);
    expect(isFaststartMp4(remuxed)).toBe(true);

    // Verify moov comes immediately after ftyp
    const ftypSize = ftyp.length;
    const moovSize = moov.length;
    expect(remuxed.subarray(0, 4).readUInt32BE(0)).toBe(ftypSize);
    expect(remuxed.toString("ascii", 4, 8)).toBe("ftyp");

    // Next box should be moov
    const nextBoxSize = remuxed.readUInt32BE(ftypSize);
    const nextBoxType = remuxed.toString("ascii", ftypSize + 4, ftypSize + 8);
    expect(nextBoxType).toBe("moov");
    expect(nextBoxSize).toBe(moovSize);

    // Next box after moov should be mdat
    const mdatPos = ftypSize + moovSize;
    const mdatBoxType = remuxed.toString("ascii", mdatPos + 4, mdatPos + 8);
    expect(mdatBoxType).toBe("mdat");
  });

  it("ensureFaststartMp4 should be idempotent on faststart files", async () => {
    const ftyp = makeBox("ftyp", Buffer.from("isommp42"));
    const moov = makeMoovBox([100, 200]);
    const mdat = makeBox("mdat", Buffer.alloc(200));

    const faststartFile = Buffer.concat([ftyp, moov, mdat]);
    const result = await ensureFaststartMp4(faststartFile);
    expect(result).toEqual(faststartFile);
  });
});
