class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound do
    render json: { message: "Not found" }, status: :not_found
  end

  private

  def resolver
    @resolver ||= ContentResolver.new(ENV.fetch("PUBLIC_API_URL", request.base_url))
  end

  # Public content: browsers may reuse it for a minute
  def public_cache
    expires_in 1.minute, public: true
  end
end
