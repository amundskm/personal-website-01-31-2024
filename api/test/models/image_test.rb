require "test_helper"

class ImageTest < ActiveSupport::TestCase
  def image(width: 1000, height: 500) = Image.new(width:, height:)

  test "whole image needs no crop" do
    assert_nil image.crop_rect
  end

  test "editor crop alone is applied" do
    crop = { "top" => 0.1, "bottom" => 0.1, "left" => 0.2, "right" => 0 }
    assert_equal [200, 50, 800, 400], image.crop_rect(crop:)
  end

  test "wide image cut to a square centres on the hotspot" do
    assert_equal [500, 0, 500, 500], image.crop_rect(hotspot: { "x" => 0.75, "y" => 0.5 }, width: 400, height: 400)
  end

  test "window stays inside the image when the hotspot is near an edge" do
    assert_equal [500, 0, 500, 500], image.crop_rect(hotspot: { "x" => 0.95, "y" => 0.5 }, width: 400, height: 400)
    assert_equal [0, 0, 500, 500], image.crop_rect(hotspot: { "x" => 0.05, "y" => 0.5 }, width: 400, height: 400)
  end

  test "tall result trims top and bottom within the editor crop" do
    crop = { "top" => 0, "bottom" => 0, "left" => 0.5, "right" => 0 }
    assert_equal [500, 125, 500, 250], image.crop_rect(crop:, width: 200, height: 100)
  end

  test "create_from_file records size and a placeholder" do
    file = png_file(64, 32)
    image = Image.create_from_file!(path: file.path, filename: "test.png", content_type: "image/png")

    assert_equal [64, 32], [image.width, image.height]
    assert_match %r{\Adata:image/jpeg;base64,}, image.lqip
    assert image.file.attached?
    assert_match(/\Aimage-\h{40}\z/, image.id)
  end

  test "create_from_file works inside a transaction, as the importer uses it" do
    file = png_file(10, 10)
    image = ActiveRecord::Base.transaction do
      Image.create_from_file!(path: file.path, filename: "t.png", content_type: "image/png")
    end
    assert_equal 10, Vips::Image.new_from_buffer(image.reload.file.download, "").width
  end

  test "stored? is false when the file is missing from storage" do
    image = Image.create_from_file!(path: png_file(10, 10).path, filename: "t.png", content_type: "image/png")
    assert image.stored?
    image.file.service.delete(image.file.key)
    assert_not image.stored?
  end
end
