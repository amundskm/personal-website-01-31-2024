require "test_helper"

class ImagesTest < ActionDispatch::IntegrationTest
  setup do
    @image = Image.create_from_file!(path: png_file(400, 200).path, filename: "a.png", content_type: "image/png")
  end

  test "serves a resized, cropped WebP that can be cached forever" do
    get "/images/#{@image.id}", params: { w: 100, h: 100, hotspot: "0.2,0.5" }
    assert_response :success
    assert_equal "image/webp", response.media_type
    assert_includes response.headers["Cache-Control"], "public"
    served = Vips::Image.new_from_buffer(response.body, "")
    assert_equal [100, 100], [served.width, served.height]
  end

  test "keeps the aspect ratio without a height" do
    get "/images/#{@image.id}", params: { w: 100 }
    served = Vips::Image.new_from_buffer(response.body, "")
    assert_equal [100, 50], [served.width, served.height]
  end

  test "serves the original without a width" do
    get "/images/#{@image.id}"
    assert_equal "image/png", response.media_type
  end

  test "ignores malformed crop parameters" do
    get "/images/#{@image.id}", params: { w: 100, crop: "1,2,x" }
    assert_response :success
  end

  test "unknown images are 404" do
    get "/images/image-nope"
    assert_response :not_found
  end
end
