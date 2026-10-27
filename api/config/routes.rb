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

  # The admin (Cognito access token, admin group)
  namespace :admin do
    resource :publish, only: %i[show create]
    resource :settings, only: %i[show update] do
      post :discard
      post :preview
    end
    resource :spending_plan, path: "spending-plan", only: %i[show update]
    resources :images, only: %i[index create]
    get "link-targets" => "link_targets#index"

    scope ":collection", constraints: { collection: /pages|posts|projects|member-pages/ } do
      get "" => "documents#index", as: :documents
      post "" => "documents#create"
      post "preview" => "documents#preview", as: :document_preview
      get ":id" => "documents#show", as: :document
      put ":id" => "documents#update"
      delete ":id" => "documents#destroy"
      post ":id/discard" => "documents#discard", as: :document_discard
      post ":id/preview" => "documents#preview"
    end
  end

  # Amplify Lambdas (shared service token)
  namespace :service do
    get "spending-plan" => "spending_plans#show"
    post "spending-plan/rules" => "spending_plans#remember_rules"
  end
end
