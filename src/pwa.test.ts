/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicFile = (name: string) =>
  fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const pngSize = (name: string) => {
  const file = readFileSync(publicFile(name));
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
};

describe("PWA installation assets", () => {
  it("declares standard, maskable and Apple installation icons", () => {
    const manifest = JSON.parse(
      readFileSync(publicFile("manifest.webmanifest"), "utf8"),
    ) as {
      display: string;
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
        expect.objectContaining({
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    );
    expect(pngSize("icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("icon-maskable-512.png")).toEqual({
      width: 512,
      height: 512,
    });
    expect(pngSize("apple-touch-icon.png")).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("pre-caches every required install asset", () => {
    const worker = readFileSync(publicFile("sw.js"), "utf8");
    for (const asset of [
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
      "apple-touch-icon.png",
    ]) {
      expect(worker).toContain(asset);
    }
  });
});
