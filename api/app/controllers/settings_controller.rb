class SettingsController < ApplicationController
  before_action :public_cache

  def show
    render json: resolver.settings(SiteSetting.instance)
  end
end
