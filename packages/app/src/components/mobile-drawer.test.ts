import { describe, expect, test } from "bun:test"
import { MobileDrawer } from "./mobile-drawer"

describe("MobileDrawer", () => {
  test("exports a component function", () => {
    expect(typeof MobileDrawer).toBe("function")
    expect(MobileDrawer.name).toBe("MobileDrawer")
  })
})
