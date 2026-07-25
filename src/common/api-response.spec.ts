import { error, success } from "./api-response";

describe("ApiResponse", () => {
  it("wraps successful data like the Spring API", () => {
    const response = success({ id: 1 }, "성공");
    expect(response).toMatchObject({
      success: true,
      message: "성공",
      data: { id: 1 },
    });
    expect(response.timestamp).toBeDefined();
  });
  it("wraps errors consistently", () =>
    expect(error("실패")).toMatchObject({
      success: false,
      message: "실패",
      data: null,
    }));
});
