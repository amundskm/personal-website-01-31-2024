# The spending plan, for the finances Lambda only. Browsers never call this:
# the Lambda decides what each role may see (merchant patterns are admin-only).
class Service::SpendingPlansController < ApplicationController
  include ServiceAuthentication

  def show
    render json: SpendingPlan.instance.as_plan
  end

  # Body: { rules: [{ categoryKey, pattern }] }
  def remember_rules
    SpendingPlan.remember_rules!(params.permit(rules: %i[categoryKey pattern]).to_h["rules"])
    head :no_content
  end
end
