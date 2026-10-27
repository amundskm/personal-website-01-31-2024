# Everything under /admin needs a Cognito access token from the admin group.
class Admin::BaseController < ApplicationController
  include CognitoAuthentication

  before_action :require_admin!

  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { message: error.record.errors.full_messages.to_sentence, errors: error.record.errors.to_hash },
           status: :unprocessable_content
  end

  private

  # The JSON body as parsed (plain hashes and arrays, types kept), not params
  def body_document
    doc = request.request_parameters["document"]
    raise ActionController::BadRequest, "Expected a document object" unless doc.is_a?(Hash)

    doc
  end

  def public_base_url = ENV.fetch("PUBLIC_API_URL", request.base_url)

  def preview_resolver
    ContentResolver.new(public_base_url, include_unpublished: true)
  end

  # Small signed thumbnails for the images a document uses, keyed by asset id,
  # so the admin can show them without resolving the whole document.
  def assets_in(document)
    ids = []
    walk = lambda do |value|
      case value
      when Array then value.each(&walk)
      when Hash
        ids << value.dig("asset", "_ref") if value["asset"].is_a?(Hash)
        value.each_value(&walk)
      end
    end
    walk.call(document)
    Image.where(id: ids.compact.uniq).to_h { |image| [image.id, image_summary(image)] }
  end

  def image_summary(image)
    { "id" => image.id, "thumbnailUrl" => image.thumbnail_url(public_base_url), "width" => image.width,
      "height" => image.height, "filename" => image.original_filename }
  end
end
