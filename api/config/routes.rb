Rails.application.routes.draw do
  # Health check for Kamal and load balancers
  get "up" => "rails/health#show", as: :rails_health_check

  # Public content, read by the website at build time and in the browser
  get "settings" => "settings#show"
  get "pages/slugs" => "pages#slugs"
  get "pages/:slug" => "pages#show"
  get "posts/slugs" => "posts#slugs"
  resources :posts, only: %i[index show], param: :slug
  get "projects/slugs" => "projects#slugs"
  resources :projects, only: %i[index show], param: :slug
  get "images/:id" => "images#show", as: :image

  # Signed-in members (Cognito access token)
  namespace :members do
    resources :pages, only: %i[index show], param: :slug
  end

  # Amplify Lambdas (shared service token)
  namespace :service do
    get "spending-plan" => "spending_plans#show"
    post "spending-plan/rules" => "spending_plans#remember_rules"
  end
end
