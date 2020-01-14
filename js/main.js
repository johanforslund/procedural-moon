function main() {
  const canvas = document.querySelector("#c");
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.autoClearColor = false;

  const camera = new THREE.OrthographicCamera(
    -1, // left
    1, // right
    1, // top
    -1, // bottom
    -1, // near,
    1 // far
  );
  const scene = new THREE.Scene();
  const plane = new THREE.PlaneBufferGeometry(2, 2);

  const fragmentShader = `
    #include <common>

    uniform vec3 iResolution;
    uniform float iTime;
    uniform float iCameraAngle;
    uniform float iCameraSpeed;
    uniform float iLacunarity;
    uniform float iAltitudes;
    uniform float iViewDistance;
    uniform float iStonesAmount;
    uniform float iSunPosition;

    vec2 hash( vec2 p ) // Used when creating noise
    {
        p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
        return -1.0 + 2.0*fract(sin(p)*43758.5453123);
    }

    #define NUM_CELLS 16.0

    // Returns the point in a given cell (used in worley)
    vec2 get_cell_point(ivec2 cell) {
        vec2 cell_base = vec2(cell) / NUM_CELLS;
        vec2 noise = hash(vec2(cell));
        return cell_base + (0.5 + 0.3 * noise) / NUM_CELLS;
    }

    // Worley noise
    vec2 worley(vec2 coord) {
        ivec2 cell = ivec2(coord * NUM_CELLS);
        float closest_dist = 1.0;
        vec2 closest_cell_point;
        
        for (int x = 0; x < 5; x++) { 
            for (int y = 0; y < 5; y++) {
                vec2 cell_point = get_cell_point(cell + ivec2(x-2, y-2));
                float dist = distance(cell_point, coord);
                if (dist < closest_dist) {
                    closest_dist = dist;
                    closest_cell_point = cell_point;
                }

            }
        }
        
        closest_dist /= length(vec2(1.0 / NUM_CELLS));
        closest_dist = 1.0 - closest_dist;
        return vec2(closest_dist, closest_cell_point.x*869.0+closest_cell_point.y*487.0);
    }

    // Perlin noise
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

    #define OCTAVES 5
    // Based on code from "Texturing and Modeling, a Procedural Approach"
    float hybridFbm(in vec2 point, float H, float lacunarity, float offset) {
        float frequency = lacunarity;
        
        float result = (noise(point) + offset);
        float weight = result;
        
        point.x *= lacunarity;
        point.y *= lacunarity;
        
        for (int i=1; i<OCTAVES; i++) {
            if (weight > 1.0) weight = 1.0;
            
            // Prevent large completely smooth areas
            if (i < 4 && i > 2) weight = weight + 0.03*sin(point.x*1.3)*sin(point.y);
            
            float signal = (noise(point) + offset) * pow(frequency, -H);
            frequency *= lacunarity;
            
            result += weight * signal;
                    
            weight *= signal;
            
            point.x *= lacunarity;
            point.y *= lacunarity;
        }
        
        return result;
    }

    float sdfSphere( vec3 p, float s )
    {
        return length(p)-s;
    }

    vec2 sdfStones(in vec3 pos) {
        vec3 q = vec3(mod(abs(pos.x), 8.0*iStonesAmount)-1.5, pos.y, mod(pos.z+1.5, 9.0*iStonesAmount)-1.5); // Local coordinate system
        
        vec2 id = vec2( floor(pos.x/(8.0*iStonesAmount)), floor((pos.z+1.5)/(9.0*iStonesAmount)) ); // Unique ID for each stone
        float fid = id.x*11.1 + id.y*31.7; // Hash to a more random ID
        
        float radius = 0.2*sin(fid*32.2) + 0.05*noise(pos.xz*3.0); // Deform radius by using ID
        
        float sphere = sdfSphere(q - 0.6*vec3(0.0, radius, 0.0), radius);
        
        return vec2(sphere, 2.0);
    }

    // Returns the closest object to 'pos' as vec2(closest distance, unique id)
    vec2 map(in vec3 pos) {
        //float floorHeight = 1.0;
        float floorHeight = 1.0 - hybridFbm(vec2(pos.xz)*0.03, 0.27, 4.5 + iLacunarity, 0.5 + iAltitudes); // Create fractal noise
        
        vec2 worl = worley(pos.xz*0.008); // Worley noise
        
        if(worl.x > 0.68) {
            // Use the cell ID to generate random cell sizes
            float innerCrater = 0.83 + 0.2*(0.5 + 0.5*sin(worl.y*33.5));
            float outerCrater = 0.74 + 0.2*(0.5 + 0.5*sin(worl.y*33.5));

            floorHeight += smoothstep(outerCrater, innerCrater, worl.x)*0.4; // Erosion

            // This is used to create an outer elevation around the crater
            if (worl.x > outerCrater - 0.05 && worl.x < outerCrater) {
                floorHeight -= 0.08*smoothstep(outerCrater - 0.05, outerCrater, worl.x);
            }  
        }
        
        // Place stoness at floorHeight
        vec2 d1 = sdfStones(pos + vec3(0.0, floorHeight, 0.0));
        
        vec2 d2 = vec2(pos.y + floorHeight, 1.0);
        
        // Return the closest object
        return (d2.x<d1.x) ? d2 : d1;
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
        
        float t = 0.1;
        float tmax = 20.0;
        
        float bt = (4.0 - rayOrigin.y)/rayDirection.y; // Find ray intersection with y = 4.0
        if (bt>0.0) tmax = min(tmax, bt); // Stop ray marching if above bt
        
        for (int i=0; i<50; i++) {
            vec3 pos = rayOrigin + t*rayDirection; // Take a step in ray direction
            
            vec2 closestObject = map(pos);
            float closestDistance = closestObject.x;
            
            res = min(res, 16.0*closestDistance/t); // Track the closest the ray were to hitting another object
            
            if (abs(closestDistance)<0.001*t) break; // Break if we are going inside object
            
            t += clamp(closestDistance, 0.05, 0.4);
            if (t>tmax || res < 0.005) break; // Break if we go too far
        }
        
        return clamp(res, 0.0, 1.0);
    }

    vec2 castRay(in vec3 rayOrigin, vec3 rayDirection) {
        float id = -1.0;
        float t = 0.2;
        float tmax = iViewDistance;
        
        float bt = (4.0 - rayOrigin.y)/rayDirection.y; // Find ray intersection with y = 4.0
        if (bt>0.0) tmax = min(tmax, bt); // Stop ray marching if above bt
        
        for (int i=0; i<64; i++) {
            vec3 pos = rayOrigin + t*rayDirection; // Take a step in ray direction
            
            vec2 closestObject = map(pos);
            float closestDistance = closestObject.x;
            id = closestObject.y;
            
            // Break if we are going inside object.
            if (abs(closestDistance)<0.001*t) break; // Multiplication by t makes ray marching stop earlier at far distance
            
            t += closestDistance;
            
            if (t>tmax) break; // Break if we go too far
        }
        if (t>tmax) id = -1.0;
        return vec2(t, id);
    }

    void mainImage( out vec4 fragColor, in vec2 fragCoord )
    {
        vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y; // Normalize screen space to [-1, 1]
        
        vec3 target = vec3(0.0, 0.95 + max(iAltitudes, 0.0) * 3.0, iTime*20.0*iCameraSpeed);
        vec3 rayOrigin = target + vec3(0.2*sin(iTime) + iCameraAngle, 0.0, -1.5);
        
        // Setup camera system
        vec3 forward = normalize(target-rayOrigin);
        vec3 right = normalize(cross(forward, vec3(0, 1, 0)));
        vec3 up = normalize(cross(right, forward));
        
        vec3 rayDirection = normalize(p.x*right + p.y*up + 1.8*forward); // Direct rays through camera plane

        vec3 col = vec3(0.01, 0.01, 0.01) - 0.01*rayDirection.y; // Sky color with tint towards horizon
        col = mix(col, vec3(0.02, 0.02, 0.02), exp(-20.0*rayDirection.y)); // Grayish fog towards horizon
        
        // Add twinkling stars to background
        vec3 starColor = vec3(1.0, 1.0, 0.9);
        col += (0.6 + 0.4*sin(iTime*12.0+p.x*80.0)*sin(iTime*24.0+p.y*80.0)) * starColor * 0.1 * (1.0 - step(noise(vec2(p.x, p.y)*40.0), 0.8));
        
        vec2 closestObject = castRay(rayOrigin, rayDirection);
        float closestId = closestObject.y;
        
        if (closestId>0.0) { // If the ray has intersected with an object
            float t = closestObject.x; // Distance to the closest object
            vec3 pos = rayOrigin + t*rayDirection; // Point on object surface
            vec3 normal = calcNormal(pos);
            
            vec3 materialColor;
            
            // Material color is chosen depending on object ID
            if (closestId>1.5) {
                materialColor = vec3(0.09, 0.1 , 0.1);
            } else { // Terrain
                materialColor = vec3(0.09, 0.1, 0.1);
                //float f = -1.0+2.0*smoothstep(-0.5, 0.5, sin(2.0*pos.x)+sin(4.0*pos.y));
                //materialColor += 0.1*f*vec3(0.09, 0.1, 0.1);
            }
            
            
            vec3 sunDirection = normalize(vec3(0.8, 0.4, 0.5 + iSunPosition));
                    
            // Use basic lightning model where intensity depends on normal direction relative to light source
            float sunDiffuse = clamp(dot(normal, sunDirection), 0.0, 1.0);
            float sunShadow = castShadow(pos+normal*0.001, sunDirection); // Check if surface point can see the sun
            float skyDiffuse = 0.2*clamp(0.5 + 0.5*dot(normal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
            
            col = materialColor*vec3(5.0, 4.5, 5.0)*sunDiffuse*sunShadow;
            col += 0.2*materialColor*vec3(0.5, 0.8, 0.9)*skyDiffuse;
        }
        
        col = pow(col, vec3(0.4545)); // Gamma correction

        fragColor = vec4(col,1.0);
    }

    void main() {
        mainImage(gl_FragColor, gl_FragCoord.xy);
    }
    `;

  const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector3() },
    iCameraAngle: { value: 0 },
    iCameraSpeed: { value: 0 },
    iLacunarity: { value: 0 },
    iAltitudes: { value: 0 },
    iViewDistance: { value: 0 },
    iStonesAmount: { value: 0 },
    iSunPosition: { sunPosition: 0 }
  };
  const material = new THREE.ShaderMaterial({
    fragmentShader,
    uniforms
  });
  scene.add(new THREE.Mesh(plane, material));

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  function render(time) {
    time *= 0.001; // convert to seconds

    resizeRendererToDisplaySize(renderer);

    const canvas = renderer.domElement;
    uniforms.iResolution.value.set(canvas.width, canvas.height, 1);
    uniforms.iTime.value = time;
    uniforms.iCameraAngle.value =
      (document.getElementById("cameraAngle").value / 100.0 - 0.5) * 6.28;
    uniforms.iCameraSpeed.value =
      document.getElementById("cameraSpeed").value / 100.0;
    uniforms.iLacunarity.value =
      (document.getElementById("lacunarity").value / 100.0 - 0.5) * 3.5;
    uniforms.iAltitudes.value =
      (document.getElementById("altitudes").value / 100.0 - 0.5) * 1.5;
    uniforms.iViewDistance.value = document.getElementById(
      "viewDistance"
    ).value;
    uniforms.iStonesAmount.value =
      1.0 - document.getElementById("stonesAmount").value / 200.0;
    uniforms.iSunPosition.value =
      (document.getElementById("sunPosition").value / 100.0 - 0.5) * 1.5;

    renderer.render(scene, camera);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();
