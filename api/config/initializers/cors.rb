# The website calls the API from the browser with bearer tokens (no cookies),
# so allowed origins are a simple list: CORS_ORIGINS, comma separated.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*ENV.fetch("CORS_ORIGINS", "").split(",").map(&:strip).reject(&:empty?))
    resource "*", headers: %w[Authorization Content-Type], methods: %i[get post put patch delete options head]
  end
end
