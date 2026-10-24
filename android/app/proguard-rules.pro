# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor reads each plugin's permissions (the @CapacitorPlugin/@Permission annotations) by reflection. Without these
# rules the release build loses them: permission checks come back empty and permission requests never answer, so
# Health Connect and reminders can't be turned on.
-keepattributes *Annotation*
-keep class com.getcapacitor.annotation.** { *; }
-keep class com.getcapacitor.PermissionState { *; }
