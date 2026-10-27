# Starts an Amplify build of this environment's branch through an incoming
# webhook (Amplify: Hosting, Build settings, Incoming webhooks), set as
# AMPLIFY_WEBHOOK_URL. Returns "started", "not_configured" or "failed".
module SiteRebuild
  def self.configured? = ENV["AMPLIFY_WEBHOOK_URL"].present?

  def self.trigger
    return "not_configured" unless configured?

    uri = URI(ENV.fetch("AMPLIFY_WEBHOOK_URL"))
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 10) do |http|
      http.post(uri.request_uri, "{}", "Content-Type" => "application/json")
    end
    response.is_a?(Net::HTTPSuccess) ? "started" : "failed"
  rescue StandardError => e
    Rails.logger.error("Site rebuild failed: #{e.class}: #{e.message}")
    "failed"
  end
end
