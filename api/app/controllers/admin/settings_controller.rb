# Site settings: drafted and published like the documents.
class Admin::SettingsController < Admin::BaseController
  def show = render(json: detail)

  def update
    settings.save_draft!(body_document)
    render json: detail
  end

  def discard
    settings.discard_changes!
    render json: detail
  end

  def preview
    render json: preview_resolver.settings(settings.preview(body_document))
  end

  private

  def settings = @settings ||= SiteSetting.instance

  def detail
    doc = settings.editable_document
    { "status" => settings.status, "document" => doc, "assets" => assets_in(doc) }
  end
end
