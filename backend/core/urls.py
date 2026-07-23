from django.urls import path

from . import views

urlpatterns = [
    # auth
    path('auth/register/', views.register),
    path('auth/login/', views.login),
    path('auth/logout/', views.logout),
    path('me/', views.me),

    # shared
    path('community/', views.community),
    path('community/display/', views.community_display),  # public, for event-day big screen

    # student
    path('student/dashboard/', views.StudentDashboard.as_view()),
    path('student/donate/', views.DonateView.as_view()),

    # teacher
    path('teacher/students/', views.TeacherStudents.as_view()),
    path('teacher/grant/', views.GrantView.as_view()),
    path('teacher/grant/<int:pk>/', views.GrantDetail.as_view()),  # 오늘 준 달란트 취소

    # admin
    path('admin/users/', views.AdminUsers.as_view()),
    path('admin/donations/', views.AdminDonations.as_view()),
    path('admin/assign/', views.AssignStudent.as_view()),
    path('admin/set-role/', views.SetRole.as_view()),
    path('admin/delete-user/', views.DeleteUser.as_view()),
    path('admin/stats/', views.AdminStats.as_view()),
    path('admin/reset-talents/', views.ResetTalents.as_view()),
]
