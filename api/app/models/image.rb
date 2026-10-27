# An uploaded image file ("asset"). Content refers to it from JSON as
# `{ "asset": { "_ref": id } }`, alongside per-usage alt text, crop and hotspot.
class Image < ApplicationRecord
  # Formats served as uploaded instead of converted to WebP
  PASSTHROUGH_TYPES = %w[image/svg+xml image/gif].freeze
  MAX_DIMENSION = 2400

  has_one_attached :file

  validates :width, :height, numericality: { greater_than: 0 }

  # Stores a file and records its size and a tiny blurred placeholder.
  # `id` keeps Sanity's asset ids on import; new uploads get a random one.
  def self.create_from_file!(path:, filename:, content_type:, id: nil)
    vips = Vips::Image.new_from_file(path.to_s)
    image = new(
      id: id || "image-#{SecureRandom.hex(20)}",
      width: vips.width,
      height: vips.height,
      lqip: placeholder_for(path),
      original_filename: filename,
    )
    File.open(path) do |io|
      image.file.attach(io:, filename:, content_type:)
      image.save!
    end
    image
  end

  # A ~20px JPEG as a data URI, shown blurred while the real image loads.
  def self.placeholder_for(path)
    thumb = ImageProcessing::Vips.source(path.to_s).resize_to_limit(20, 20).convert("jpg").saver(quality: 60).call
    "data:image/jpeg;base64,#{Base64.strict_encode64(File.binread(thumb.path))}"
  rescue Vips::Error
    nil
  ensure
    thumb&.close!
  end

  # What the site receives in place of an asset reference (the shape Sanity's
  # `asset->{ _id, url, metadata { lqip, dimensions } }` projection returned).
  def as_asset(base_url)
    {
      "_id" => id,
      "url" => "#{base_url}/images/#{id}",
      "metadata" => {
        "lqip" => lqip,
        "dimensions" => { "width" => width, "height" => height, "aspectRatio" => width.fdiv(height) },
      },
    }
  end

  def passthrough?
    PASSTHROUGH_TYPES.include?(file.content_type)
  end

  # Pixel rectangle [left, top, width, height] to cut from the original for one
  # usage, or nil for the whole image. Ported from @sanity/image-url: apply the
  # editor's crop, then, if a target aspect ratio is given, cut a window of that
  # ratio centred on the hotspot as far as the crop allows.
  #
  # `crop` and `hotspot` are the fractions Sanity stores on an image usage.
  def crop_rect(crop: nil, hotspot: nil, width: nil, height: nil)
    crop_left = (crop&.fetch("left", 0) || 0) * self.width
    crop_top = (crop&.fetch("top", 0) || 0) * self.height
    crop_width = self.width - ((crop&.fetch("right", 0) || 0) * self.width) - crop_left
    crop_height = self.height - ((crop&.fetch("bottom", 0) || 0) * self.height) - crop_top
    cropped = crop_left.positive? || crop_top.positive? || crop_width < self.width || crop_height < self.height

    unless width && height
      return cropped ? [crop_left, crop_top, crop_width, crop_height].map(&:round) : nil
    end

    spot_x = (hotspot&.fetch("x", 0.5) || 0.5) * self.width
    spot_y = (hotspot&.fetch("y", 0.5) || 0.5) * self.height
    desired = width.fdiv(height)

    if crop_width.fdiv(crop_height) > desired
      # Wider than wanted: trim the sides around the hotspot
      out_height = crop_height.round
      out_width = (out_height * desired).round
      left = [0, (spot_x - out_width / 2.0).round].max
      left = left.clamp(crop_left.round, (crop_left + crop_width - out_width).round)
      [left, [0, crop_top.round].max, out_width, out_height]
    else
      # Taller than wanted: trim top and bottom
      out_width = crop_width.round
      out_height = (out_width / desired).round
      top = [0, (spot_y - out_height / 2.0).round].max
      top = top.clamp(crop_top.round, (crop_top + crop_height - out_height).round)
      [[0, crop_left.round].max, top, out_width, out_height]
    end
  end

  # An Active Storage variant at the requested size for one usage.
  def variant_for(width:, height: nil, crop: nil, hotspot: nil)
    width = width.clamp(1, MAX_DIMENSION)
    height = height&.clamp(1, MAX_DIMENSION)
    rect = crop_rect(crop:, hotspot:, width:, height:)

    transformations = {}
    transformations[:crop] = rect if rect
    transformations[:resize_to_limit] = [width, height || MAX_DIMENSION]
    transformations[:format] = :webp
    transformations[:saver] = { quality: 80 }
    file.variant(transformations)
  end
end
