# The family spending plan. Edits apply immediately: it isn't public content
# and the site doesn't need rebuilding for it.
class Admin::SpendingPlansController < Admin::BaseController
  def show
    render json: { "document" => SpendingPlan.instance.to_document }
  end

  def update
    plan = SpendingPlan.instance
    plan.save_document!(body_document)
    render json: { "document" => plan.to_document }
  end
end
