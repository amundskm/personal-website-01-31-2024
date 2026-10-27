require "active_support/core_ext/integer/time"

# Production and QA (both run RAILS_ENV=production; see config/deploy*.yml).
Rails.application.configure do
  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Images live in this environment's S3 bucket (S3_BUCKET, see config/storage.yml).
  config.active_storage.service = :amazon

  # kamal-proxy terminates TLS: treat requests as HTTPS, redirect plain HTTP
  # and send Strict-Transport-Security. The health check stays on HTTP.
  config.assume_ssl = true
  config.force_ssl = true
  config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Only answer for this environment's API host (DNS rebinding protection).
  config.hosts = [ ENV.fetch("APP_HOST") ]
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  # In-process cache for rate limits and Cognito's signing keys (one Puma process).
  config.cache_store = :memory_store, { size: 32.megabytes }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]
end
