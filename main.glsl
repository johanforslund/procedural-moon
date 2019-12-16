vec2 hash( vec2 p ) // replace this by something better
{
	p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
	return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise( in vec2 p )
{
    const float K1 = 0.366025404; // (sqrt(3)-1)/2;
    const float K2 = 0.211324865; // (3-sqrt(3))/6;

	vec2  i = floor( p + (p.x+p.y)*K1 );
    vec2  a = p - i + (i.x+i.y)*K2;
    float m = step(a.y,a.x); 
    vec2  o = vec2(m,1.0-m);
    vec2  b = a - o + K2;
	vec2  c = a - 1.0 + 2.0*K2;
    vec3  h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
	vec3  n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
    return dot( n, vec3(70.0) );
}

#define OCTAVES 6
float fbm (in vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = .5;
    //
    // Loop of octaves
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}

// From "Texturing and Modeling, a Procedural Approach"
float heteroFbm(in vec2 point, float H, float lacunarity, float offset) {
	float[OCTAVES+1] expArray;
    float frequency = 1.0;
    
    for (int i=0; i<=OCTAVES; i++) {
    	expArray[i] = pow(frequency, -H);
        frequency *= lacunarity;
    }
    
    float value = offset + noise(point);
    point.x *= lacunarity;
    point.y *= lacunarity;
    
    float increment;
    
    for (int i=1; i<OCTAVES; i++) {
     	increment = noise(point) + offset;
        increment *= expArray[i];
        increment *= value;
        value += increment;
        
        point.x *= lacunarity;
        point.y *= lacunarity;
    }
    
    
    return value;
}

// From "Texturing and Modeling, a Procedural Approach"
float hybridFbm(in vec2 point, float H, float lacunarity, float offset) {
    float[OCTAVES+1] expArray;
    float frequency = 1.0;
    
    for (int i=0; i<=OCTAVES; i++) {
    	expArray[i] = pow(frequency, -H);
        frequency *= lacunarity;
    }
    
    float result = (noise(point) + offset) * expArray[0];
    float weight = result;
    
    point.x *= lacunarity;
    point.y *= lacunarity;
    
    for (int i=1; i<OCTAVES; i++) {
     	if (weight > 1.0) weight = 1.0;
        
        float signal = (noise(point) + offset) * expArray[i];
        
        result += weight * signal;
        
        weight *= signal;
        
        point.x *= lacunarity;
        point.y *= lacunarity;
    }
    
    return result;
}

// Returns the closest object to 'pos' as vec2(closest distance, unique id)
vec2 map(in vec3 pos) {
	vec2 d1 = vec2(1000000.0, -1.0); // Substitute with other object
    
    //float floorHeight = 3.0 - heteroFbm(vec2(pos.xz)*0.03, 1.0, 2.5, 1.1); // Create fractal noise
    float floorHeight = 1.0 - hybridFbm(vec2(pos.xz)*0.03, 0.27, 4.5, 0.5); // Create fractal noise
    //float floorHeight = 1.0 - fbm(pos.xz*0.13);
        
    float d2 = pos.y + floorHeight;
    
    return (d2<d1.x) ? vec2(d2, 1.0) : d1;
}

vec3 calcNormal(in vec3 pos) {
    vec2 e = vec2(0.0001, 0.0);
    
    // Approximate gradient (surface normal) by computing changes in position
	return normalize(vec3(map(pos+e.xyy).x-map(pos-e.xyy).x,
                          map(pos+e.yxy).x-map(pos-e.yxy).x,
                          map(pos+e.yyx).x-map(pos-e.yyx).x));
}

float castShadow(in vec3 rayOrigin, vec3 rayDirection) {
 	float res = 1.0;
    
    float t = 0.0;
    for (int i=0; i<1000; i++) {
    	vec3 pos = rayOrigin + t*rayDirection; // Take a step in ray direction
        
        vec2 closestObject = map(pos);
        float closestDistance = closestObject.x;
        
        res = min(res, 16.0*closestDistance/t); // Track the closest the ray were to hitting another object
        
        if (closestDistance<0.001) break; // Break if we are going inside object
        
        t += closestDistance;
        if (t>20.0) break; // Break if we go too far
    }
    
    return clamp(res, 0.0, 1.0);
}

vec2 castRay(in vec3 rayOrigin, vec3 rayDirection) {
    float id = -1.0;
 	float t = 0.0;
    for (int i=0; i<1000; i++) {
        vec3 pos = rayOrigin + t*rayDirection; // Take a step in ray direction
        
        vec2 closestObject = map(pos);
        float closestDistance = closestObject.x;
        id = closestObject.y;
        
        if (closestDistance<0.001) break; // Break if we are going inside object
        
        t += closestDistance;
        
        if (t>40.0) break; // Break if we go too far
    }
    if (t>40.0) id = -1.0;
    return vec2(t, id);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y; // Normalize screen space to [-1, 1]
    
    vec3 target = vec3(0.0 + iTime*2.0, 0.95, 0.0 + iTime*2.0);
    vec3 rayOrigin = target + vec3(0.2*sin(iTime), 0.0, -1.5);
    
    // Setup camera system
    vec3 forward = normalize(target-rayOrigin);
    vec3 right = normalize(cross(forward, vec3(0, 1, 0)));
    vec3 up = normalize(cross(right, forward));
    
    vec3 rayDirection = normalize(p.x*right + p.y*up + 1.8*forward); // Direct rays through camera plane

    vec3 col = vec3(0.01, 0.01, 0.01) - 0.01*rayDirection.y; // Sky color with tint towards horizon
    col = mix(col, vec3(0.02, 0.02, 0.02), exp(-20.0*rayDirection.y)); // Grayish fog towards horizon
    
    vec2 closestObject = castRay(rayOrigin, rayDirection);
    float closestId = closestObject.y;
    
    if (closestId>0.0) { // If the ray has intersected with an object
        float t = closestObject.x; // Distance to the closest object
        vec3 pos = rayOrigin + t*rayDirection; // Point on object surface
        vec3 normal = calcNormal(pos);
        
        vec3 materialColor = vec3(0.18);
        
        // Material color is chosen depending on object ID
        if (closestId>3.5) {
        	materialColor = vec3(0.02);   
        } else if (closestId>2.5) {
        	materialColor = vec3(0.4);   
        } else if (closestId>1.5) {
           	materialColor = vec3(0.2, 0.1 , 0.02);
        } else { // Terrain
          	materialColor = vec3(0.11, 0.11, 0.1);
           	//float f = -1.0+2.0*smoothstep(-0.2, 0.2, sin(18.0*pos.x)+sin(18.0*pos.y)+sin(18.0*pos.z));
           	//materialColor += 0.2*f*vec3(0.06, 0.06, 0.02);
        }
        
        
        vec3 sunDirection = normalize(vec3(0.8, 0.4, 0.2));
        
        // Use basic lightning model where intensity depends on normal direction relative to light source
        float sunDiffuse = clamp(dot(normal, sunDirection), 0.0, 1.0);
        float sunShadow = castShadow(pos+normal*0.001, sunDirection); // Check if surface point can see the sun
        float skyDiffuse = clamp(0.5 + 0.5*dot(normal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
        float bounceDiffuse = clamp(0.5 + 0.5*dot(normal, vec3(0.0, -1.0, 0.0)), 0.0, 1.0);
        
   		col = materialColor*vec3(5.0, 4.5, 5.0)*sunDiffuse*sunShadow;
        col += materialColor*vec3(0.5, 0.8, 0.9)*skyDiffuse;
        col += materialColor*vec3(0.3, 0.3, 0.2)*bounceDiffuse;
    }
    
    col = pow(col, vec3(0.4545)); // Gamma correction

    fragColor = vec4(col,1.0);
}